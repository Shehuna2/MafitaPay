# backend/accounts/views_webauthn.py
import base64
import json
from django.contrib.auth import get_user_model
from rest_framework import status, views
from rest_framework.response import Response
from fido2.server import Fido2Server
from fido2.webauthn import PublicKeyCredentialRpEntity, PublicKeyCredentialUserEntity
from fido2 import cbor

User = get_user_model()
RP = PublicKeyCredentialRpEntity(name="MafitaPay", id="localhost")  # adjust in prod
server = Fido2Server(RP)

# In-memory storage for challenges (for demo, use Redis/DB in production)
CHALLENGES = {}

class WebAuthnChallengeView(views.APIView):
    """
    Generate a WebAuthn login challenge for a given user
    """
    def post(self, request):
        email = request.data.get("email")
        if not email:
            return Response({"detail": "Email required"}, status=400)
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"detail": "User not found"}, status=404)

        user_entity = PublicKeyCredentialUserEntity(
            id=str(user.id).encode(),
            name=user.email,
            display_name=user.email,
        )

        # Check if user has registered a credential
        if not user.webauthn_credential_id:
            return Response({
                "detail": "Biometric credential not registered. Please register your biometric authentication first."
            }, status=400)

        # create authentication options
        auth_data, state = server.authenticate_begin([{
            "id": base64.urlsafe_b64decode(user.webauthn_credential_id),
            "type": "public-key"
        }])
        
        # Store challenge in memory for verification
        CHALLENGES[user.id] = state

        return Response(auth_data)

class WebAuthnVerifyView(views.APIView):
    """
    Verify WebAuthn assertion
    """
    def post(self, request):
        user_id = request.data.get("user_id")
        assertion_response = request.data.get("assertion")

        if not user_id or not assertion_response:
            return Response({"detail": "Missing data"}, status=400)

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found"}, status=404)

        state = CHALLENGES.get(user.id)
        if not state:
            return Response({"detail": "No challenge found"}, status=400)

        # Check if user has registered a credential
        if not user.webauthn_credential_id:
            return Response({
                "detail": "Biometric credential not registered. Please register your biometric authentication first."
            }, status=400)

        # Decode the response from client
        assertion = cbor.decode(base64.urlsafe_b64decode(assertion_response))

        try:
            auth_data = server.authenticate_complete(
                state,
                [{
                    "id": base64.urlsafe_b64decode(user.webauthn_credential_id),
                    "public_key": user.webauthn_public_key,
                    "sign_count": user.webauthn_sign_count
                }],
                assertion
            )
        except Exception as e:
            return Response({"detail": "Authentication failed", "error": str(e)}, status=400)

        # Update sign_count
        user.webauthn_sign_count = auth_data["sign_count"]
        user.save(update_fields=["webauthn_sign_count"])

        # Generate JWT tokens as normal login
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        return Response({
            "user": {
                "id": user.id,
                "email": user.email,
                "is_merchant": user.is_merchant,
            },
            "access": access_token,
            "refresh": refresh_token,
        })
