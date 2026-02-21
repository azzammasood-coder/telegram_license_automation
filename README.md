# Telegram License Automation 
## Guide

1. Repo link: https://github.com/azzammasood-coder/telegram_license_automation
- Click on Code (Green button), then click on Download Zip.
- Extract the zip to get a single folder, go inside it, this is the Root folder/Bot Folder/Base folder (these mean the same thing).

2. Make sure python is installed. Make sure the PSDs are inside the root folder. Make sure the py files and jsx files are also inside the bot folder.

3. In config.json, update these:
- The base_dir is the root folder, change it.
- photoshop_exe is the path of the Adobe Photoshop EXE file, change it.
- Change the admin_chat_id. This is the id of your telegram user. To obtain it, on telegram, search for @IDBot, and send /start message to it, it will give you a 10-digit number with your username, this number is your id.
- Do not change filenames unless you changed the names of the psd files.

4. Place the psd files inside the PSDs folder in the root folder.

5. Place the lightburn files inside the Lightburn folder in the root folder.

6. The Automated Messages folder contains the Messages and Previews folder. Messages folder contains payment message and any other future message that we might add. Previews folder contains the front and back images of each state.

6. ONLY IF NOT DONE BEFORE: Move the PSUserConfig.txt to C:\Users\<username>\AppData\Roaming\Adobe\<your photoshop version>\Adobe Photoshop 2021 Settings\

7. ONLY IF NOT DONE BEFORE: In a terminal, navigate to the root folder, and run the command: pip install -r requirements.txt

8. To run the bot, in the terminal, run this command: python telegram_bot.py

9. In the logs folder, the telegram bot logs and photoshop logs are created. If there is any problem, please refer to these logs.

Notes:

- For Eyes, it does not matter what user has typed in (BRN or BRO), it is automatically handled in the template. For NJ it is BRN, for NY it is BRO.

