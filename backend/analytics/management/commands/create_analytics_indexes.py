# analytics/management/commands/create_analytics_indexes.py
"""
Management command to create database indexes for analytics queries.
This improves query performance for the CEO dashboard.

Run with: python manage.py create_analytics_indexes
"""

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Create database indexes for analytics queries to improve performance'

    def handle(self, *args, **options):
        self.stdout.write('Creating analytics indexes...')
        
        with connection.cursor() as cursor:
            # Determine database type
            db_vendor = connection.vendor
            
            indexes = []
            
            if db_vendor == 'sqlite':
                # SQLite index syntax
                indexes = [
                    "CREATE INDEX IF NOT EXISTS idx_wallet_tx_created_status ON wallet_wallettransaction(created_at, status)",
                    "CREATE INDEX IF NOT EXISTS idx_wallet_tx_category_status ON wallet_wallettransaction(category, status)",
                    "CREATE INDEX IF NOT EXISTS idx_wallet_tx_type_status ON wallet_wallettransaction(tx_type, status)",
                    "CREATE INDEX IF NOT EXISTS idx_user_date_joined ON accounts_user(date_joined)",
                    "CREATE INDEX IF NOT EXISTS idx_user_verified ON accounts_user(is_email_verified)",
                    "CREATE INDEX IF NOT EXISTS idx_p2p_deposit_created_status ON p2p_depositorder(created_at, status)",
                    "CREATE INDEX IF NOT EXISTS idx_crypto_created_status ON gasfee_cryptopurchase(created_at, status)",
                    "CREATE INDEX IF NOT EXISTS idx_bonus_created_status ON rewards_bonus(created_at, status)",
                ]
            elif db_vendor == 'postgresql':
                # PostgreSQL index syntax
                indexes = [
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_created_status ON wallet_wallettransaction(created_at, status)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_category_status ON wallet_wallettransaction(category, status)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_type_status ON wallet_wallettransaction(tx_type, status)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_date_joined ON accounts_user(date_joined)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_verified ON accounts_user(is_email_verified)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_p2p_deposit_created_status ON p2p_depositorder(created_at, status)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crypto_created_status ON gasfee_cryptopurchase(created_at, status)",
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bonus_created_status ON rewards_bonus(created_at, status)",
                ]
            else:
                # MySQL/MariaDB or other databases
                indexes = [
                    "CREATE INDEX idx_wallet_tx_created_status ON wallet_wallettransaction(created_at, status)",
                    "CREATE INDEX idx_wallet_tx_category_status ON wallet_wallettransaction(category, status)",
                    "CREATE INDEX idx_wallet_tx_type_status ON wallet_wallettransaction(tx_type, status)",
                    "CREATE INDEX idx_user_date_joined ON accounts_user(date_joined)",
                    "CREATE INDEX idx_user_verified ON accounts_user(is_email_verified)",
                    "CREATE INDEX idx_p2p_deposit_created_status ON p2p_depositorder(created_at, status)",
                    "CREATE INDEX idx_crypto_created_status ON gasfee_cryptopurchase(created_at, status)",
                    "CREATE INDEX idx_bonus_created_status ON rewards_bonus(created_at, status)",
                ]
            
            for index_sql in indexes:
                try:
                    cursor.execute(index_sql)
                    self.stdout.write(self.style.SUCCESS(f'✓ Created: {index_sql.split("ON")[1].split("(")[0].strip()}'))
                except Exception as e:
                    # Index might already exist
                    if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                        self.stdout.write(self.style.WARNING(f'○ Already exists: {index_sql.split("ON")[1].split("(")[0].strip()}'))
                    else:
                        self.stdout.write(self.style.ERROR(f'✗ Error creating index: {str(e)}'))
        
        self.stdout.write(self.style.SUCCESS('\nAnalytics indexes created successfully!'))
        self.stdout.write('These indexes will improve query performance for the CEO dashboard.')
