from django.core.management.base import BaseCommand
from accounts.models import User
import uuid

class Command(BaseCommand):
    help = "Generate referral codes for users without one"

    def handle(self, *args, **options):
        users = User.objects.filter(referral_code__isnull=True)
        total = users.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS("✅ All users already have referral codes."))
            return

        for user in users:
            base_code = user.username[:3].upper() if user.username else "MAF"
            unique_part = uuid.uuid4().hex[:5].upper()
            user.referral_code = f"{base_code}{unique_part}"
            user.save(update_fields=["referral_code"])

        self.stdout.write(self.style.SUCCESS(f"🎉 Generated referral codes for {total} users."))
