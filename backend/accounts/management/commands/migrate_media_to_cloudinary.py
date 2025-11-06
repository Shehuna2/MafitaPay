from django.core.management.base import BaseCommand
from django.core.files import File
from django.apps import apps
import os
from cloudinary.uploader import upload

class Command(BaseCommand):
    help = "Migrate all existing local media files to Cloudinary"

    def handle(self, *args, **options):
        media_root = os.path.join(os.getcwd(), "media")
        if not os.path.exists(media_root):
            self.stdout.write(self.style.ERROR("No /media folder found."))
            return

        uploaded_count = 0
        for root, dirs, files in os.walk(media_root):
            for filename in files:
                local_path = os.path.join(root, filename)
                relative_path = os.path.relpath(local_path, media_root)

                # Skip already uploaded (cloudinary urls)
                if relative_path.startswith("cloudinary/"):
                    continue

                try:
                    result = upload(local_path, public_id=relative_path)
                    url = result.get("secure_url")
                    if url:
                        self.stdout.write(self.style.SUCCESS(f"Uploaded: {relative_path}"))
                        uploaded_count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Failed: {relative_path} → {e}"))

        self.stdout.write(self.style.SUCCESS(f"✅ Completed. {uploaded_count} files uploaded."))
