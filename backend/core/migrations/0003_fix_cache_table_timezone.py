# Migration to fix timezone-aware datetime handling in cache table
# This migration recreates the analytics_cache_table with proper timezone support
# to fix "TypeError: can't compare offset-naive and offset-aware datetimes"
from django.db import migrations, models


def fix_cache_table_timezone(apps, schema_editor):
    """
    Recreate the cache table with timezone-aware datetime support.
    This fixes the issue where TIMESTAMP (without timezone) causes comparison
    errors with Django's timezone-aware datetime objects when USE_TZ=True.
    """
    table_name = 'analytics_cache_table'
    qn = schema_editor.connection.ops.quote_name
    
    with schema_editor.connection.cursor() as cursor:
        # Drop and recreate the table with proper timezone-aware fields
        # Using Django's field types ensures timezone support on PostgreSQL
        
        # Drop existing table and its index
        cursor.execute(f"DROP TABLE IF EXISTS {qn(table_name)}")
        
        # Create fields with proper types
        cache_key_field = models.CharField(max_length=255, primary_key=True)
        value_field = models.TextField()
        expires_field = models.DateTimeField(db_index=True)
        
        # Get proper SQL types for each field (handles timezone awareness)
        cache_key_type = cache_key_field.db_type(connection=schema_editor.connection)
        value_type = value_field.db_type(connection=schema_editor.connection)
        expires_type = expires_field.db_type(connection=schema_editor.connection)
        
        # Create table with timezone-aware datetime field
        # On PostgreSQL with USE_TZ=True, this creates TIMESTAMP WITH TIME ZONE
        create_sql = f"""
            CREATE TABLE {qn(table_name)} (
                {qn('cache_key')} {cache_key_type} NOT NULL PRIMARY KEY,
                {qn('value')} {value_type} NOT NULL,
                {qn('expires')} {expires_type} NOT NULL
            )
        """
        cursor.execute(create_sql)
        
        # Create index on expires column
        index_sql = f"""
            CREATE INDEX {qn(table_name + '_expires_idx')} 
            ON {qn(table_name)} ({qn('expires')})
        """
        cursor.execute(index_sql)


def reverse_fix(apps, schema_editor):
    """
    Reverse migration - recreate table with old schema.
    Note: This will lose timezone awareness and may reintroduce the bug.
    In production, this reverse migration should ideally not be used.
    """
    table_name = 'analytics_cache_table'
    qn = schema_editor.connection.ops.quote_name
    
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f"DROP TABLE IF EXISTS {qn(table_name)}")
        
        # Use Django field types for consistency, even in reverse
        cache_key_field = models.CharField(max_length=255, primary_key=True)
        value_field = models.TextField()
        # Note: Using DateTimeField here too for consistency
        # The bug would only appear with raw TIMESTAMP on PostgreSQL
        expires_field = models.DateTimeField(db_index=True)
        
        cache_key_type = cache_key_field.db_type(connection=schema_editor.connection)
        value_type = value_field.db_type(connection=schema_editor.connection)
        expires_type = expires_field.db_type(connection=schema_editor.connection)
        
        cursor.execute(f"""
            CREATE TABLE {qn(table_name)} (
                {qn('cache_key')} {cache_key_type} NOT NULL PRIMARY KEY,
                {qn('value')} {value_type} NOT NULL,
                {qn('expires')} {expires_type} NOT NULL
            )
        """)
        
        cursor.execute(f"""
            CREATE INDEX {qn(table_name + '_expires_idx')} 
            ON {qn(table_name)} ({qn('expires')})
        """)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_create_analytics_cache_table'),
    ]

    operations = [
        migrations.RunPython(
            fix_cache_table_timezone,
            reverse_code=reverse_fix,
        ),
    ]
