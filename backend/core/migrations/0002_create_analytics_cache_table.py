# Generated migration for analytics cache table
# This creates the cache table required by Django's DatabaseCache backend
# for the CEO Analytics Dashboard (PR #61)
from django.db import migrations, models


def create_cache_table(apps, schema_editor):
    """
    Create the analytics_cache_table for Django's database cache backend.
    Uses Django's schema editor to ensure timezone-aware datetime handling.
    Compatible with both PostgreSQL (production) and SQLite (development).
    """
    # Use Django's schema editor for proper timezone-aware datetime fields
    # This ensures TIMESTAMP WITH TIME ZONE on PostgreSQL when USE_TZ=True
    table_name = 'analytics_cache_table'
    qn = schema_editor.connection.ops.quote_name
    
    # Create table using schema editor for proper field type handling
    with schema_editor.connection.cursor() as cursor:
        # Check if table already exists (database-agnostic approach)
        table_names = schema_editor.connection.introspection.table_names()
        
        if table_name not in table_names:
            # Table doesn't exist, create it with Django's field types
            # Create fields with proper types based on Django's field definitions
            cache_key_field = models.CharField(max_length=255, primary_key=True)
            value_field = models.TextField()
            expires_field = models.DateTimeField(db_index=True)
            
            # Get proper SQL types for each field (handles timezone awareness)
            cache_key_type = cache_key_field.db_type(connection=schema_editor.connection)
            value_type = value_field.db_type(connection=schema_editor.connection)
            expires_type = expires_field.db_type(connection=schema_editor.connection)
            
            # Create table with timezone-aware datetime field
            create_sql = f"""
                CREATE TABLE {qn(table_name)} (
                    {qn('cache_key')} {cache_key_type} NOT NULL PRIMARY KEY,
                    {qn('value')} {value_type} NOT NULL,
                    {qn('expires')} {expires_type} NOT NULL
                )
            """
            cursor.execute(create_sql)
            
            # Create index on expires column for cache cleanup performance
            index_sql = f"""
                CREATE INDEX {qn(table_name + '_expires_idx')} 
                ON {qn(table_name)} ({qn('expires')})
            """
            cursor.execute(index_sql)


def drop_cache_table(apps, schema_editor):
    """Drop the analytics cache table."""
    with schema_editor.connection.cursor() as cursor:
        qn = schema_editor.connection.ops.quote_name
        cursor.execute(f"DROP TABLE IF EXISTS {qn('analytics_cache_table')}")


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
