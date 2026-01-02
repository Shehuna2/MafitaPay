# Generated migration for analytics cache table
# This creates the cache table required by Django's DatabaseCache backend
# for the CEO Analytics Dashboard (PR #61)
from django.db import migrations, connection


def create_cache_table(apps, schema_editor):
    """
    Create the analytics_cache_table for Django's database cache backend.
    Compatible with both PostgreSQL (production) and SQLite (development).
    """
    # Use Django's schema editor to create database-agnostic SQL
    with schema_editor.connection.cursor() as cursor:
        # For PostgreSQL and SQLite compatibility
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analytics_cache_table (
                cache_key VARCHAR(255) NOT NULL PRIMARY KEY,
                value TEXT NOT NULL,
                expires TIMESTAMP NOT NULL
            )
        """)
        # Create index on expires column for cache cleanup performance
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS analytics_cache_table_expires_idx 
            ON analytics_cache_table (expires)
        """)


def drop_cache_table(apps, schema_editor):
    """Drop the analytics cache table."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("DROP TABLE IF EXISTS analytics_cache_table")


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            create_cache_table,
            reverse_code=drop_cache_table,
        ),
    ]
