#!/usr/bin/env bash
set -euo pipefail
umask 077
# Even before credentials arrive, no process may leave this namespace.
iptables -P OUTPUT DROP
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
ip6tables -P OUTPUT DROP
ip6tables -P INPUT DROP
test -c /dev/kvm || { echo 'KVM device unavailable' >&2; exit 1; }
for attempt in $(seq 1 60); do
  test -s /run/network.json && break
  sleep 1
done
test -s /run/network.json || { echo 'Network configuration missing' >&2; exit 1; }
python3 /opt/clouddroid/firewall.py
chown 1001:1001 /run/network.json
chmod 400 /run/network.json
mkdir -p /data/avd /data/android
chown -R 1000:1000 /data
chmod 700 /data
# Only /dev/kvm access, not root or NET_ADMIN, is granted to the emulator user.
kvm_gid=$(stat -c '%g' /dev/kvm)
groupadd -o -g "$kvm_gid" hostkvm
usermod -aG hostkvm android
gosu tunnel /opt/venv/bin/python /opt/clouddroid/tunnel.py &
tunnel_pid=$!
if ! test -f /data/avd/cloud.ini; then
  echo no | gosu android avdmanager create avd -n cloud -k "$SYSTEM_IMAGE" --device pixel_2 --force
  printf '\nhw.lcd.width=720\nhw.lcd.height=1280\nhw.lcd.density=240\nhw.ramSize=2048\nhw.keyboard=yes\ndisk.dataPartition.size=4G\n' >> /data/avd/cloud.avd/config.ini
fi
# Prevent stale quick-boot snapshots from changing profile isolation or guest state.
gosu android emulator -avd cloud -accel on -no-window -no-audio -no-boot-anim \
  -no-snapshot -gpu swiftshader -memory 2048 -cores 2 -port 5554 -dns-server 127.0.0.1 &
emulator_pid=$!
shutdown() {
  kill -TERM "$emulator_pid" "$tunnel_pid" 2>/dev/null || true
  wait "$emulator_pid" 2>/dev/null || true
}
trap shutdown TERM INT
(
  for attempt in $(seq 1 180); do
    if gosu android adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -qx 1; then
      gosu android adb -s emulator-5554 shell cmd location set-location-enabled false >/dev/null 2>&1 || true
      break
    fi
    sleep 2
  done
) &
# If the connector dies, fail-closed firewall remains installed; stop Android as well.
wait -n "$emulator_pid" "$tunnel_pid" || true
shutdown
