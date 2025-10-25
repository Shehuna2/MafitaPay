# backend/p2p/consumers.py
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

logger = logging.getLogger('p2p')


class OrderConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.order_type = self.scope["url_route"]["kwargs"]["order_type"]
        self.group_name = f"order_{self.order_type}_{self.order_id}"

        # --- Extract token from query string ---
        query_string = self.scope["query_string"].decode()
        token = None
        for param in query_string.split('&'):
            if param.startswith('token='):
                token = param[len('token='):]
                break

        if not token:
            logger.warning(f"❌ No token provided for WebSocket connection: {self.group_name}")
            await self.close(code=4001, reason="No token provided")
            return

        try:
            user = await self.get_user_from_token(token)
            if not user:
                logger.warning(f"❌ Invalid user for token: {self.group_name}")
                await self.close(code=4002, reason="User not found")
                return
            self.scope["user"] = user
        except InvalidToken:
            logger.warning(f"❌ Invalid or expired token for {self.group_name}")
            await self.close(code=4003, reason="Invalid or expired token")
            return
        except Exception as e:
            logger.error(f"Unexpected token validation error: {str(e)}")
            await self.close(code=4005, reason=f"Token validation error: {str(e)}")
            return

        # --- Permission check ---
        if not await self.has_permission():
            logger.warning(f"🚫 Permission denied for {self.scope['user']} on {self.group_name}")
            await self.close(code=4004, reason="Permission denied")
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        logger.info(f"✅ WebSocket connected for {self.scope['user'].email} on {self.group_name}")
        await self.accept()

    @database_sync_to_async
    def get_user_from_token(self, token):
        jwt_auth = JWTAuthentication()
        validated_token = jwt_auth.get_validated_token(token)
        return jwt_auth.get_user(validated_token)

    @database_sync_to_async
    def has_permission(self):
        """Ensure only order participants can join the WebSocket group."""
        from .models import DepositOrder, WithdrawOrder

        user = self.scope["user"]
        if self.order_type == "withdraw-order":
            try:
                order = WithdrawOrder.objects.select_related(
                    "buyer_offer__merchant", "seller"
                ).get(id=self.order_id)
                return order.seller == user or order.buyer_offer.merchant == user
            except WithdrawOrder.DoesNotExist:
                return False
        else:
            try:
                order = DepositOrder.objects.select_related(
                    "sell_offer__merchant", "buyer"
                ).get(id=self.order_id)
                return order.buyer == user or order.sell_offer.merchant == user
            except DepositOrder.DoesNotExist:
                return False

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(f"🔌 WebSocket disconnected: {self.group_name}, code={close_code}")

    async def send_order_update(self, event):
        """Triggered by signal when an order updates → broadcast new serialized data."""
        order_data = await self.get_serialized_order_data()
        if not order_data:
            await self.close(code=4006, reason="Order not found")
            return

        await self.send(text_data=json.dumps({
            "type": "order_update",
            "data": order_data,
        }))
        logger.info(f"📤 Sent order update → {self.group_name}")

    @database_sync_to_async
    def get_serialized_order_data(self):
        """Safely serialize the updated order for WebSocket clients."""
        from .models import DepositOrder, WithdrawOrder
        from .serializers import DepositOrderSerializer, WithdrawOrderSerializer

        try:
            if self.order_type == "withdraw-order":
                order = WithdrawOrder.objects.select_related(
                    "seller", "buyer_offer__merchant"
                ).get(id=self.order_id)
                serializer = WithdrawOrderSerializer(order)
            else:
                order = DepositOrder.objects.select_related(
                    "buyer", "sell_offer__merchant"
                ).get(id=self.order_id)
                serializer = DepositOrderSerializer(order)
            return serializer.data
        except (DepositOrder.DoesNotExist, WithdrawOrder.DoesNotExist):
            logger.warning(f"❌ Order not found while serializing: {self.group_name}")
            return None
