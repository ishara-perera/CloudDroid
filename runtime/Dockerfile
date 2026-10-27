FROM ubuntu:24.04
ARG CMDLINE_TOOLS=15859902
ARG CMDLINE_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
ARG SYSTEM_IMAGE=system-images;android-35;google_apis;x86_64
ENV DEBIAN_FRONTEND=noninteractive ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/emulator:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip openjdk-17-jre-headless \
    libnss3 libpulse0 libasound2t64 libx11-6 libxcb1 libxcomposite1 libxcursor1 libxi6 libxtst6 \
    libxrandr2 libxdamage1 libxfixes3 libglib2.0-0 libdbus-1-3 libgl1 libvulkan1 \
    iptables gosu python3 python3-venv && rm -rf /var/lib/apt/lists/*
# The operator accepts SDK licenses before invoking the build (deploy script enforces this).
RUN mkdir -p /opt/android-sdk/cmdline-tools && \
    curl --fail --location --proto '=https' --tlsv1.2 \
      "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" -o /tmp/tools.zip && \
    echo "${CMDLINE_SHA256}  /tmp/tools.zip" | sha256sum -c - && \
    unzip -q /tmp/tools.zip -d /opt/android-sdk/cmdline-tools && \
    mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest && rm /tmp/tools.zip
RUN yes | sdkmanager --licenses > /dev/null && sdkmanager 'platform-tools' 'emulator' "${SYSTEM_IMAGE}"
RUN useradd -u 1000 -m android && useradd -u 1001 -m tunnel && \
    python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir 'httpx[socks]==0.28.1' 'dnslib==0.9.26'
ENV PATH=/opt/venv/bin:${PATH} SYSTEM_IMAGE=${SYSTEM_IMAGE} HOME=/data ANDROID_USER_HOME=/data/android ANDROID_AVD_HOME=/data/avd
COPY runtime/ /opt/clouddroid/
RUN chmod +x /opt/clouddroid/entrypoint.sh
ENTRYPOINT ["/opt/clouddroid/entrypoint.sh"]
