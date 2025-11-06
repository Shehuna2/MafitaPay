#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mafitapay.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)

    # Additional code to update user profile image URLs after migration
    from User.models import User
    for user in User.objects.all():
    if user.profile_image and not str(user.profile_image).startswith("http"):
        user.profile_image.save(user.profile_image.name, user.profile_image.file, save=True)
    print("✅ Updated all profile image URLs to Cloudinary")


if __name__ == '__main__':
    main()

