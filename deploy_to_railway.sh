#!/bin/bash
# Script to deploy the application to Railway

echo "===== Railway Deployment Helper ====="
echo "This script will help you deploy the fixed migrations to Railway."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI is not installed. Please install it first:"
    echo "npm i -g @railway/cli"
    exit 1
fi

# Check if user is logged in to Railway
echo "Checking Railway login status..."
railway whoami || {
    echo "Please login to Railway first:"
    echo "railway login"
    exit 1
}

# List Railway projects
echo -e "\nAvailable Railway projects:"
railway project list

# Ask user to select project
echo -e "\nPlease select a project by running:"
echo "railway link"

# Ask user to confirm
read -p "Have you linked to the correct project? (y/n): " confirm
if [[ $confirm != "y" ]]; then
    echo "Deployment aborted. Please link to the correct project."
    exit 1
fi

# Show environment variables
echo -e "\nChecking Railway environment variables..."
railway variables list

# Check if DB_URL exists
echo -e "\nChecking for DATABASE_URL..."
if railway variables list | grep -q "DATABASE_URL"; then
    echo "✅ DATABASE_URL is set in Railway."
else
    echo "⚠️ WARNING: DATABASE_URL is not set in Railway. Set it with:"
    echo "railway variables set DATABASE_URL=postgresql://your_connection_string"
fi

# Add options menu
echo -e "\nWhat would you like to do?"
echo "1. Run migrations on Railway (remotely)"
echo "2. Deploy the application to Railway"
echo "3. Check the database tables on Railway"
echo "4. Set environment variables on Railway"
echo "5. View Railway logs"
echo "6. Exit"

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo -e "\nRunning migrations on Railway..."
        railway run python manage.py migrate
        echo "Verifying migrations..."
        railway run python manage.py showmigrations rides
        ;;
    2)
        echo -e "\nDeploying to Railway..."
        echo "This will trigger a new build and deployment."
        read -p "Are you sure? (y/n): " deploy_confirm
        if [[ $deploy_confirm == "y" ]]; then
            railway up
            echo "Deployment started! Check status at: https://railway.app/dashboard"
        else
            echo "Deployment canceled."
        fi
        ;;
    3)
        echo -e "\nChecking database tables on Railway..."
        railway run python check_railway_db.py
        ;;
    4)
        echo -e "\nSetting up environment variables..."
        read -p "Enter variable name: " var_name
        read -p "Enter variable value: " var_value
        echo "Setting $var_name..."
        railway variables set $var_name=$var_value
        ;;
    5)
        echo -e "\nViewing Railway logs..."
        railway logs
        ;;
    6)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo -e "\nDone!" 