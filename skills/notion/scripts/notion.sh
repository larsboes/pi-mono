#!/bin/bash
# Notion API Helper Script
# Usage: notion.sh <command> [args]

set -e

NOTION_API="https://api.notion.com/v1"
HEADERS=(-H "Authorization: Bearer $NOTION_API_TOKEN" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json")

if [ -z "$NOTION_API_TOKEN" ]; then
    echo "Error: NOTION_API_TOKEN not set"
    exit 1
fi

case "$1" in
    page)
        # notion.sh page <page_id>
        curl -s "${NOTION_API}/pages/$2" "${HEADERS[@]}" | jq .
        ;;
    content|blocks)
        # notion.sh content <page_id>
        curl -s "${NOTION_API}/blocks/$2/children" "${HEADERS[@]}" | jq .
        ;;
    query)
        # notion.sh query <database_id> [filter_json]
        if [ -n "$3" ]; then
            curl -s -X POST "${NOTION_API}/databases/$2/query" "${HEADERS[@]}" -d "$3" | jq .
        else
            curl -s -X POST "${NOTION_API}/databases/$2/query" "${HEADERS[@]}" | jq .
        fi
        ;;
    create-parent)
        # notion.sh create-parent <parent_page_id> <title> <content>
        PARENT_ID="$2"
        TITLE="$3"
        CONTENT="$4"
        curl -s -X POST "${NOTION_API}/pages" "${HEADERS[@]}" -d "{
            \"parent\": { \"page_id\": \"$PARENT_ID\" },
            \"properties\": {
                \"title\": {
                    \"title\": [{ \"text\": { \"content\": \"$TITLE\" } }]
                }
            },
            \"children\": [
                {
                    \"object\": \"block\",
                    \"type\": \"paragraph\",
                    \"paragraph\": {
                        \"rich_text\": [{ \"type\": \"text\", \"text\": { \"content\": \"$CONTENT\" } }]
                    }
                }
            ]
        }" | jq .
        ;;
    create-db)
        # notion.sh create-db <database_id> <properties_json>
        DATABASE_ID="$2"
        PROPS="$3"
        curl -s -X POST "${NOTION_API}/pages" "${HEADERS[@]}" -d "{
            \"parent\": { \"database_id\": \"$DATABASE_ID\" },
            \"properties\": $PROPS
        }" | jq .
        ;;
    update)
        # notion.sh update <page_id> <properties_json>
        PAGE_ID="$2"
        PROPS="$3"
        curl -s -X PATCH "${NOTION_API}/pages/$PAGE_ID" "${HEADERS[@]}" -d "{\"properties\": $PROPS}" | jq .
        ;;
    search)
        # notion.sh search <query>
        curl -s -X POST "${NOTION_API}/search" "${HEADERS[@]}" -d "{\"query\": \"$2\"}" | jq .
        ;;
    *)
        echo "Notion API Helper"
        echo ""
        echo "Usage: notion.sh <command> [args]"
        echo ""
        echo "Commands:"
        echo "  page <page_id>                    - Get page metadata"
        echo "  content <page_id>                 - Get page content (blocks)"
        echo "  query <database_id> [filter]      - Query database"
        echo "  create-parent <parent_id> <title> <content>  - Create page under parent"
        echo "  create-db <database_id> <props>   - Create database entry"
        echo "  update <page_id> <props>          - Update page properties"
        echo "  search <query>                    - Search workspace"
        echo ""
        echo "Examples:"
        echo "  notion.sh page 1234567890abcdef12345678"
        echo "  notion.sh query abcdef1234567890abcdef12"
        echo "  notion.sh create-parent 123... \"Meeting Notes\" \"Discussion about...\""
        echo "  notion.sh update 123... '{\"Status\":{\"select\":{\"name\":\"Done\"}}}'"
        ;;
esac
