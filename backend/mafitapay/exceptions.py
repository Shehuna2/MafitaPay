# zunhub_project/exceptions.py
import traceback
import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        response.data["success"] = False
        response.data["status_code"] = response.status_code
        return response

    view = context.get("view", None)
    view_name = view.__class__.__name__ if view else "UnknownView"

    logger.error(f"Unhandled Exception in {view_name}: {exc}", exc_info=True)

    error_data = {
        "success": False,
        "error": str(exc),
        "view": view_name,
        "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
    }

    if settings.DEBUG:
        error_data["traceback"] = traceback.format_exc()

    return Response(error_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)