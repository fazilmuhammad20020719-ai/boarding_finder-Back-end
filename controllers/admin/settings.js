const { query } = require("../../db");

const getPlatformSettings = async (req, res) => {
  try {
    const result = await query("SELECT setting_key, setting_value FROM platform_settings");
    
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    return res.status(200).json({ settings });
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updatePlatformSettings = async (req, res) => {
  try {
    const { settings } = req.body; // Expecting an object of key-value pairs

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ message: "Invalid settings payload." });
    }

    // Update each setting one by one (or batch if preferred, but usually only a few)
    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO platform_settings (setting_key, setting_value, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP) 
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
    }

    return res.status(200).json({ message: "Settings updated successfully." });
  } catch (error) {
    console.error("Error updating platform settings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getPlatformSettings, updatePlatformSettings };
