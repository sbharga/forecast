import os
import sys
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv

# Load environment variables first so ai_parser can see them on import
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# Ensure we can import from core (assuming working directory might vary)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import database, ai_parser, geocoder

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"


class ReviewView(discord.ui.View):
    def __init__(self, event_data: dict):
        super().__init__(timeout=None)
        self.event_data = event_data

    @discord.ui.button(label="Accept", style=discord.ButtonStyle.green, custom_id="accept_event")
    async def accept(self, interaction: discord.Interaction, button: discord.ui.Button):
        coords = geocoder.get_coordinates(self.event_data.get("location", ""))
        if coords is None:
            lat, lng = 0.0, 0.0
        else:
            lat, lng = coords

        self.event_data["lat"] = lat
        self.event_data["lng"] = lng

        # Ensure defaults are met if not fully parsed
        self.event_data["title"] = self.event_data.get("title") or "Unknown Event"
        self.event_data["link"] = self.event_data.get("link") or ""

        # upsert to DB
        database.upsert_events([self.event_data])

        embed = interaction.message.embeds[0]
        embed.color = discord.Color.green()
        embed.title = f"[ACCEPTED] {embed.title}"

        # Disable buttons
        for child in self.children:
            child.disabled = True
        
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="Deny", style=discord.ButtonStyle.red, custom_id="deny_event")
    async def deny(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = interaction.message.embeds[0]
        embed.color = discord.Color.red()
        embed.title = f"[DENIED] {embed.title}"

        # Disable buttons
        for child in self.children:
            child.disabled = True
            
        await interaction.response.edit_message(embed=embed, view=self)


class ScopeBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True 

        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        # Load db schema
        database.init_db()
        await self.tree.sync()
        print("Slash commands synced successfully!")

bot = ScopeBot()


@bot.event
async def on_ready():
    activity = discord.Activity(type=discord.ActivityType.watching, name="for events")
    await bot.change_presence(status=discord.Status.online, activity=activity)
    
    print(f'Logged in as {bot.user} (ID: {bot.user.id})')


@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return
        
    events_channel_id = database.get_events_channel(message.guild.id) if message.guild else None
    
    if events_channel_id and message.channel.id == events_channel_id:
        img_bytes = None
        mime_type = "image/png"
        
        if message.attachments:
            att = message.attachments[0]
            if att.content_type and att.content_type.startswith("image/"):
                img_bytes = await att.read()
                mime_type = att.content_type
                
        # Run in executor since Gemini API call is synchronous and blocking
        import asyncio
        loop = asyncio.get_event_loop()
        event_data = await loop.run_in_executor(
            None, 
            lambda: ai_parser.extract_event(message.content, img_bytes, mime_type)
        )
        
        # If parsed successfully and location matches a registered building
        if event_data and event_data.get("location"):
            event_data["id"] = message.id
            
            review_channel = bot.get_channel(1492658346648404251)
            if review_channel:
                embed = discord.Embed(
                    title=event_data.get("title", "Unknown Event"),
                    description=f"**Location:** {event_data.get('location')}\n**Time:** {event_data.get('start_time')}\n**Link:** {event_data.get('link') or 'N/A'}",
                    color=discord.Color.blurple()
                )
                
                embed.add_field(name="Source Server", value=message.guild.name)
                embed.add_field(name="Jump Link", value=message.jump_url)
                
                if message.attachments and message.attachments[0].content_type and message.attachments[0].content_type.startswith("image/"):
                    embed.set_image(url=message.attachments[0].url)
                    
                await review_channel.send(embed=embed, view=ReviewView(event_data))
                
    await bot.process_commands(message)


@bot.tree.command(name="set_events_channel", description="Set the channel where events will be posted (Admin only)")
@app_commands.default_permissions(administrator=True)
async def set_events_channel(interaction: discord.Interaction, channel: discord.TextChannel):
    database.set_events_channel(interaction.guild_id, channel.id)
    await interaction.response.send_message(f"Events channel set to {channel.mention}", ephemeral=True)


if __name__ == "__main__":
    bot.run(os.environ.get("DISCORD_BOT_TOKEN", ""))
