const { query } = require("../db");

const getConversations = async (req, res) => {
  try {
    const user_id = req.user.id;
    const role = req.user.role;

    // Fetch conversations for the logged-in user (whether owner or seeker)
    let sql = `
      SELECT c.*, l.title as property_title, l.image_urls,
             u_other.name as other_name, u_other.id as other_id,
             (SELECT message_text FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message_time,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.conversation_id AND m.sender_id != $1 AND m.is_read = FALSE) as unread_count
      FROM conversations c
      JOIN listings l ON c.listing_id = l.listing_id
      JOIN users u_other ON (
        CASE 
          WHEN c.seeker_id = $1 THEN c.owner_id = u_other.id
          ELSE c.seeker_id = u_other.id
        END
      )
      WHERE c.seeker_id = $1 OR c.owner_id = $1
      ORDER BY last_message_time DESC NULLS LAST, c.updated_at DESC
    `;
    
    const result = await query(sql, [user_id]);
    res.status(200).json({ conversations: result.rows });
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const user_id = req.user.id;

    // Verify user is part of the conversation
    const convCheck = await query("SELECT * FROM conversations WHERE conversation_id = $1 AND (seeker_id = $2 OR owner_id = $2)", [conversationId, user_id]);
    if (convCheck.rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await query(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversationId]
    );

    res.status(200).json({ messages: result.rows });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const sendMessage = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { listing_id, receiver_id, text, conversation_id } = req.body;

    let targetConvId = conversation_id;

    if (!targetConvId) {
      if (!listing_id || !receiver_id) return res.status(400).json({ error: "Missing required fields to start conversation" });
      
      // Determine seeker and owner
      const isOwner = req.user.role === 'owner';
      const ownerId = isOwner ? user_id : receiver_id;
      const seekerId = isOwner ? receiver_id : user_id;

      // Check if conversation exists
      const checkConv = await query(
        "SELECT conversation_id FROM conversations WHERE listing_id = $1 AND seeker_id = $2 AND owner_id = $3",
        [listing_id, seekerId, ownerId]
      );

      if (checkConv.rows.length > 0) {
        targetConvId = checkConv.rows[0].conversation_id;
      } else {
        // Create new conversation
        const newConv = await query(
          "INSERT INTO conversations (listing_id, seeker_id, owner_id) VALUES ($1, $2, $3) RETURNING conversation_id",
          [listing_id, seekerId, ownerId]
        );
        targetConvId = newConv.rows[0].conversation_id;
      }
    } else {
      // Verify user is in conversation
      const convCheck = await query("SELECT * FROM conversations WHERE conversation_id = $1 AND (seeker_id = $2 OR owner_id = $2)", [targetConvId, user_id]);
      if (convCheck.rows.length === 0) return res.status(403).json({ error: "Unauthorized" });
    }

    // Insert message
    const msgRes = await query(
      "INSERT INTO messages (conversation_id, sender_id, message_text) VALUES ($1, $2, $3) RETURNING *",
      [targetConvId, user_id, text]
    );

    // Update conversation updated_at
    await query("UPDATE conversations SET updated_at = NOW() WHERE conversation_id = $1", [targetConvId]);

    res.status(201).json({ message: msgRes.rows[0], conversation_id: targetConvId });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const user_id = req.user.id;

    await query(
      "UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE",
      [conversationId, user_id]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getConversations, getMessages, sendMessage, markAsRead };
