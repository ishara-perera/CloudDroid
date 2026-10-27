"""Inbound-only Twilio integration. No public inboxes or purchasing APIs."""
import time

from twilio.http.http_client import TwilioHttpClient
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.rest import Client


def client(config):
    return Client(config["account_sid"], config["auth_token"],
                  http_client=TwilioHttpClient(timeout=15))


def inventory(config):
    api = client(config)
    account = api.api.accounts(config["account_sid"]).fetch()
    numbers = api.incoming_phone_numbers.list(limit=200)
    return {"status": "connected", "trial": account.type == "Trial",
            "account_status": account.status,
            "numbers": [{"sid": n.sid, "number": n.phone_number,
                         "name": n.friendly_name, "capabilities": n.capabilities,
                         "number_type": "provider-owned inventory; use Lookup for line type",
                         "google_verification": "unknown"} for n in numbers]}


def owned_number(config, sid):
    number = client(config).incoming_phone_numbers(sid).fetch()
    if number.account_sid != config["account_sid"] or not number.phone_number.startswith("+1"):
        raise ValueError("Only owned +1 numbers may be assigned")
    # +1 includes NANP territories/Canada. Country confirmed using provider Lookup.
    lookup = client(config).lookups.v2.phone_numbers(number.phone_number).fetch()
    if lookup.country_code != "US" or not lookup.valid:
        raise ValueError("A valid US telephone number is required")
    if not (number.capabilities.get("sms") or number.capabilities.get("voice")):
        raise ValueError("Number does not support inbound SMS or voice")
    return {"sid": number.sid, "number": number.phone_number, "capabilities": number.capabilities,
            "country": "US", "google_verification": "unknown", "ownership": "verified_with_provider",
            "ownership_checked_at": time.time(), "number_type": "unknown; paid line-type lookup not requested"}


def voice_token(config, profile_id):
    if not all(config.get(k) for k in ("api_key", "api_secret", "twiml_app_sid")):
        raise ValueError("Voice requires a Twilio API key, secret and TwiML application SID")
    token = AccessToken(config["account_sid"], config["api_key"], config["api_secret"],
                        identity="profile-" + profile_id, ttl=600)
    # No outgoing_application_sid -> token cannot initiate outgoing PSTN calls.
    token.add_grant(VoiceGrant(incoming_allow=True))
    return {"token": token.to_jwt(), "identity": "profile-" + profile_id, "expires_in": 600}
