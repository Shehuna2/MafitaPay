# backend/p2p/consumers.py
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger('p2p')


class OrderConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.order_type = self.scope["url_route"]["kwargs"]["order_type"]
        self.group_name = f"order_{self.order_type}_{self.order_id}"

        logger.debug(f"🔌 Incoming WebSocket connection: {self.group_name}")
        logger.debug(f"🔎 Query string: {self.scope.get('query_string')}")
        logger.debug(f"🔎 Scope headers: {self.scope.get('headers')}")

        token = self._extract_token_from_query_string()
        if not token:
            logger.error(f"❌ No token provided for WebSocket connection: {self.group_name}")
            await self.close(code=4001, reason="No token provided")
            return

        user = await self._authenticate_token(token)
        if not user:
            return

        self.scope["user"] = user

        if not await self.has_permission():
            logger.error(f"🚫 Permission denied for user {self.scope['user'].email} on order {self.order_id}")
            await self.close(code=4004, reason="Permission denied")
            return

        logger.info(f"✅ Permission granted for {self.scope['user'].email} on {self.group_name}")

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        logger.info(f"✅ WebSocket successfully connected for {self.scope['user'].email}: {self.group_name}")
        await self.accept()

    def _extract_token_from_query_string(self):
        query_string = self.scope.get("query_string", b"").decode()
        for param in query_string.split('&'):
            if param.startswith('token='):
                return param[len('token='):]
        return None

    async def _authenticate_token(self, token):
        try:
            user = await self.get_user_from_token(token)
            logger.debug(f"✅ Token validated for user: {user}")
            if not user:
                logger.error(f"❌ User not found for token: {self.group_name}")
                await self.close(code=4002, reason="User not found")
                return None
            return user
        except Exception as e:
            from rest_framework_simplejwt.exceptions import InvalidToken
            if isinstance(e, InvalidToken):
                logger.error(f"❌ Invalid or expired token for WebSocket: {str(e)}, group: {self.group_name}")
                await self.close(code=4003, reason=f"Invalid token: {str(e)}")
            else:
                logger.exception(f"🔥 Unexpected error during token validation for group {self.group_name}: {str(e)}")
                await self.close(code=4005, reason=f"Token validation error: {str(e)}")
            return None

    @database_sync_to_async
    def get_user_from_token(self, token):
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        validated_token = jwt_auth.get_validated_token(token)
        return jwt_auth.get_user(validated_token)

    @database_sync_to_async
    def has_permission(self):
        from .models import DepositOrder, WithdrawOrder
        user = self.scope["user"]
        order_model = WithdrawOrder if self.order_type == "withdraw-order" else DepositOrder
        try:
            order = order_model.objects.get(id=self.order_id)
            if self.order_type == "withdraw-order":
                return order.seller == user or order.buyer_offer.merchant == user
            return order.buyer == user or order.sell_offer.merchant == user
        except order_model.DoesNotExist:
            logger.error(f"Order {self.order_id} not found for type {self.order_type}")
            return False

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(f"WebSocket disconnected: {self.group_name}, code: {close_code}")

    async def send_order_update(self, event):
        order_data = await self.get_serialized_order_data()
        if not order_data:
            await self.close(code=4006, reason="Order not found")
            return

        await self.send(text_data=json.dumps({
            "type": "order_update",
            "data": order_data,
        }))
        logger.info(f"Sent order update for {self.group_name}")

    @database_sync_to_async
    def get_serialized_order_data(self):
        from .models import DepositOrder, WithdrawOrder
        from .serializers import DepositOrderSerializer, WithdrawOrderSerializer

        order_model = WithdrawOrder if self.order_type == "withdraw-order" else DepositOrder
        serializer_class = WithdrawOrderSerializer if self.order_type == "withdraw-order" else DepositOrderSerializer

        try:
            order = order_model.objects.select_related(
                "buyer", "seller",
                "buyer_offer__merchant", "sell_offer__merchant"
            ).get(id=self.order_id)
            serializer = serializer_class(order)
            return serializer.data
        except order_model.DoesNotExist:
            logger.error(f"Order {self.order_id} not found during update for {self.group_name}")
            return None
