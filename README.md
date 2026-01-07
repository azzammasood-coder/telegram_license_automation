1. Repo link: https://github.com/azzammasood-coder/telegram_license_automation
Click on Code (Green button), then click on Download Zip.
Extract the zip to get a single folder, go inside it, this is the Root folder/Bot Folder/Base folder (these mean the same thing).

2. Make sure python is installed. Make sure the PSDs are inside the root folder. Make sure the py files and jsx files are also inside the bot folder.

3. In config.json, update the paths:
- The base_dir is the root folder, change it.
- photoshop_exe is the path of the Adobe Photoshop EXE file, change it.
- Do not change filenames unless you changed the names of the psd files.

4. Place the psd files inside the PSDs folder in the root folder.

5. Move the PSUserConfig.txt to C:\Users\<username>\AppData\Roaming\Adobe\<your photoshop version>\Adobe Photoshop 2021 Settings\

6. In a terminal, navigate to the root folder, and run the command: pip install -r requirements.txt

7. To run the bot, in the terminal, run this command: python telegram_bot.py

8. When the bot is running correctly, then in the bot folder, the photoshop logs will be created, if there is any problem in editing the template, please refer to these logs.