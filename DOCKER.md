# DailyNode Discord Bot - Docker Setup

## Quick Start

### Using Docker Compose (Recommended)

1. **Build and start the bot:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f
   ```

3. **Stop the bot:**
   ```bash
   docker-compose down
   ```

4. **Restart the bot:**
   ```bash
   docker-compose restart
   ```

### Using Docker directly

1. **Build the image:**
   ```bash
   docker build -t dailynode-bot .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name dailynode-bot \
     --env-file .env \
     -v $(pwd)/config.json:/app/config.json \
     --restart unless-stopped \
     dailynode-bot
   ```

## Configuration

Ensure your `.env` file contains:
```env
DISCORD_TOKEN=your_discord_bot_token
clientId=your_client_id
guildId=your_guild_id
```

## Maintenance

**Update the bot:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**View real-time logs:**
```bash
docker-compose logs -f dailynode
```

**Execute commands inside container:**
```bash
docker-compose exec dailynode sh
```

## Timezone

The default timezone is set to `America/New_York`. To change it:
1. Edit `docker-compose.yml`
2. Change the `TZ` environment variable
3. Restart: `docker-compose restart`

## Data Persistence

The `config.json` file is mounted as a volume to persist:
- LeetCode channel configuration
- Daily problem data

This ensures your settings survive container restarts.
