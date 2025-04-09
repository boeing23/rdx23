# Railway Deployment Guide

This guide explains how to deploy the fixed application to Railway.

## Prerequisites

1. Install the Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

## Deployment Steps

### 1. Link to Your Railway Project

List available projects:
```bash
railway project list
```

Link to your project:
```bash
railway link
```

### 2. Check Database Connection

Before doing any migrations, check if you can connect to the database:
```bash
railway run python check_postgres_schema.py
```

This will provide details about the current database schema, migration status, and any issues.

### 3. Deploy Fixed Migrations

Run the migrations:
```bash
railway run python manage.py migrate
```

Verify the migrations were applied:
```bash
railway run python manage.py showmigrations rides
```

### 4. Deploy the Application

Deploy your application:
```bash
railway up
```

This will trigger a new build and deployment of your application.

### 5. Verify Deployment

Check the logs to ensure everything is running correctly:
```bash
railway logs
```

## Using the Deployment Helper Script

We've provided a deployment helper script that guides you through the process:

```bash
./deploy_to_railway.sh
```

This script will:
1. Check if Railway CLI is installed
2. Verify your login status
3. Show your available projects
4. Prompt you to link to a project
5. Check environment variables
6. Provide options for running migrations, deploying, checking the database, etc.

## Troubleshooting PostgreSQL Issues

If you encounter database issues, here are some troubleshooting steps:

### 1. Check Database Connection

Verify that your application can connect to the database:
```bash
railway run python check_postgres_schema.py
```

### 2. Check Environment Variables

Make sure `DATABASE_URL` is properly set:
```bash
railway variables list
```

If needed, you can set it manually:
```bash
railway variables set DATABASE_URL=postgres://username:password@hostname:port/database_name
```

### 3. Check Table Structure

If some columns are missing or incorrect, run the migrations again:
```bash
railway run python manage.py migrate rides
```

### 4. Reset Database (Last Resort)

If everything else fails, you might need to reset the database:
1. Go to the Railway dashboard
2. Navigate to your PostgreSQL service
3. Click "Settings" and find the "Danger Zone"
4. Use "Reset Database" option (WARNING: This will delete all data!)
5. After reset, run all migrations again:
   ```bash
   railway run python manage.py migrate
   ```

## Testing After Deployment

After successful deployment, test the application by:

1. Visit your Railway application URL
2. Try to create a new ride
3. Verify that the frontend can retrieve ride data correctly

If you encounter any issues with the frontend not properly communicating with the backend, check:
1. CORS settings
2. API endpoint URLs
3. Authentication (if applicable)

## Common Issues

### 1. Migration Errors

If you see migration errors, the safest approach is to use empty migrations as we did locally:
```bash
railway run python manage.py makemigrations rides --empty -n fix_migrations
```

Then edit the migration file and run:
```bash
railway run python manage.py migrate
```

### 2. PostgreSQL Connection Errors

If you see connection errors to PostgreSQL, check:
- Is the DATABASE_URL correct?
- Is the PostgreSQL service running?
- Are the firewall/network settings allowing connections?

### 3. Frontend Issues

If the frontend can't communicate with the backend:
- Check CORS settings
- Verify that frontend is using the correct API base URL
- Check browser console for errors

## Maintaining the Deployment

Remember to regularly:
1. Check the logs for errors
2. Monitor database performance
3. Update dependencies as needed 