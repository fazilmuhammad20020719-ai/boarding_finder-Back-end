const { query } = require("../db");

// 1. Get My Roommate Profile
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const sql = `SELECT * FROM roommate_profiles WHERE user_id = $1`;
    const result = await query(sql, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(200).json({ profile: null });
    }
    
    return res.status(200).json({ profile: result.rows[0] });
  } catch (error) {
    console.error("Error fetching my roommate profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 2. Create or Update My Roommate Profile
const upsertProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { age, occupation, budget_min, budget_max, bio, tags, location, gender, preferred_gender } = req.body;
    
    // Check if profile exists
    const checkSql = `SELECT profile_id FROM roommate_profiles WHERE user_id = $1`;
    const checkResult = await query(checkSql, [userId]);
    
    const formattedTags = Array.isArray(tags) ? tags : [];
    
    // User name for Avatar Generation
    const userSql = `SELECT name FROM users WHERE id = $1`;
    const userResult = await query(userSql, [userId]);
    const name = userResult.rows[0]?.name || "Student";
    const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ebf3ff&color=1952c4`;

    let result;
    if (checkResult.rows.length > 0) {
      // Update
      const updateSql = `
        UPDATE roommate_profiles 
        SET age = $1, occupation = $2, budget_min = $3, budget_max = $4, bio = $5, tags = $6, location = $7, gender = $8, preferred_gender = $9, updated_at = NOW()
        WHERE user_id = $10
        RETURNING *;
      `;
      result = await query(updateSql, [age, occupation, budget_min, budget_max, bio, formattedTags, location, gender, preferred_gender, userId]);
    } else {
      // Insert
      const insertSql = `
        INSERT INTO roommate_profiles (user_id, age, occupation, budget_min, budget_max, bio, tags, avatar_url, location, gender, preferred_gender)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `;
      result = await query(insertSql, [userId, age, occupation, budget_min, budget_max, bio, formattedTags, avatar_url, location, gender, preferred_gender]);
    }
    
    return res.status(200).json({ message: "Profile saved successfully", profile: result.rows[0] });
  } catch (error) {
    console.error("Error saving roommate profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 3. Get Potential Matches (All other profiles with calculated match score)
const getPotentialMatches = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Get my profile to compare against
    const myProfileSql = `SELECT * FROM roommate_profiles WHERE user_id = $1`;
    const myProfileResult = await query(myProfileSql, [userId]);
    
    // 2. Get all other profiles with their user details, EXCLUDING those we passed on OR have connections with
    const othersSql = `
      SELECT r.*, u.name 
      FROM roommate_profiles r
      JOIN users u ON r.user_id = u.id
      WHERE r.user_id != $1
      AND r.user_id NOT IN (
          SELECT passed_on_id FROM roommate_passes WHERE passer_id = $1
      )
      AND r.user_id NOT IN (
          SELECT receiver_id FROM roommate_connections WHERE requester_id = $1
          UNION
          SELECT requester_id FROM roommate_connections WHERE receiver_id = $1
      )
      ORDER BY r.created_at DESC
    `;
    const othersResult = await query(othersSql, [userId]);
    
    let matches = othersResult.rows;
    
    // If the current user has a profile, calculate match scores
    if (myProfileResult.rows.length > 0) {
      const myProfile = myProfileResult.rows[0];
      const myTags = myProfile.tags || [];
      const myBudgetAvg = (Number(myProfile.budget_min) + Number(myProfile.budget_max)) / 2;
      const myGender = myProfile.gender || 'Any';
      const myPrefGender = myProfile.preferred_gender || 'Any';
      const myLocation = (myProfile.location || '').toLowerCase();
      
      matches = matches.filter(match => {
        const theirGender = match.gender || 'Any';
        const theirPrefGender = match.preferred_gender || 'Any';
        
        if (myPrefGender !== 'Any' && theirGender !== 'Any' && myPrefGender !== theirGender) return false;
        if (theirPrefGender !== 'Any' && myGender !== 'Any' && theirPrefGender !== myGender) return false;
        
        return true;
      }).map(match => {
        const theirTags = match.tags || [];
        const theirLocation = (match.location || '').toLowerCase();
        
        // Location Match (up to 40 points)
        let locScore = 0;
        if (myLocation && theirLocation) {
           if (myLocation === theirLocation) {
              locScore = 40;
           } else if (myLocation.includes(theirLocation) || theirLocation.includes(myLocation)) {
              locScore = 20;
           }
        }

        // Tag overlap (up to 30 points)
        let sharedTags = 0;
        theirTags.forEach(tag => {
          if (myTags.includes(tag)) sharedTags++;
        });
        const maxTags = Math.max(myTags.length, theirTags.length, 1);
        const tagScore = (sharedTags / maxTags) * 30;
        
        // Budget similarity (up to 30 points)
        const theirBudgetAvg = (Number(match.budget_min) + Number(match.budget_max)) / 2;
        let budgetScore = 30;
        if (myBudgetAvg > 0 && theirBudgetAvg > 0) {
          const diffRatio = Math.abs(myBudgetAvg - theirBudgetAvg) / Math.max(myBudgetAvg, theirBudgetAvg);
          budgetScore = Math.max(0, 30 * (1 - (diffRatio * 2))); // penalize budget diffs quickly
        }
        
        const totalScore = Math.round(locScore + tagScore + budgetScore);

        
        return {
          ...match,
          matchScore: totalScore > 100 ? 100 : totalScore
        };
      });
      
      // Sort by match score descending
      matches.sort((a, b) => b.matchScore - a.matchScore);
    } else {
      // Default score if no profile
      matches = matches.map(match => ({ ...match, matchScore: 50 }));
    }
    
    return res.status(200).json({ matches });
  } catch (error) {
    console.error("Error fetching matches:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 4. Record a "Pass" on a profile
const passProfile = async (req, res) => {
  try {
    const passerId = req.user.id;
    const { passedId } = req.body;
    
    if (!passedId) {
      return res.status(400).json({ message: "Missing passedId in request body" });
    }

    const sql = `
      INSERT INTO roommate_passes (passer_id, passed_on_id) 
      VALUES ($1, $2)
      ON CONFLICT (passer_id, passed_on_id) DO NOTHING;
    `;
    await query(sql, [passerId, passedId]);
    
    return res.status(200).json({ message: "Profile passed successfully" });
  } catch (error) {
    console.error("Error passing roommate profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 5. Send Connection Request
const sendConnectionRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { receiverId } = req.body;
    
    if (!receiverId) return res.status(400).json({ message: "Missing receiverId" });

    // Check if a connection already exists in either direction
    const checkSql = `
      SELECT id FROM roommate_connections 
      WHERE (requester_id = $1 AND receiver_id = $2) 
         OR (requester_id = $2 AND receiver_id = $1)
    `;
    const checkRes = await query(checkSql, [requesterId, receiverId]);
    if (checkRes.rows.length > 0) {
      return res.status(400).json({ message: "Connection request already exists or was processed" });
    }

    const insertSql = `
      INSERT INTO roommate_connections (requester_id, receiver_id, status) 
      VALUES ($1, $2, 'pending') RETURNING *
    `;
    await query(insertSql, [requesterId, receiverId]);
    
    return res.status(200).json({ message: "Connection request sent successfully" });
  } catch (error) {
    console.error("Error sending connection request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 6. Get Incoming Connection Requests
const getConnectionRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const sql = `
      SELECT c.id as connection_id, r.*, u.name 
      FROM roommate_connections c
      JOIN roommate_profiles r ON c.requester_id = r.user_id
      JOIN users u ON r.user_id = u.id
      WHERE c.receiver_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `;
    const result = await query(sql, [userId]);
    return res.status(200).json({ requests: result.rows });
  } catch (error) {
    console.error("Error fetching connection requests:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 7. Respond to Connection Request
const respondToConnectionRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { connectionId } = req.params;
    const { action } = req.body; // 'accepted' or 'rejected'

    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const updateSql = `
      UPDATE roommate_connections 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 AND receiver_id = $3
      RETURNING *
    `;
    const result = await query(updateSql, [action, connectionId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Connection request not found or unauthorized" });
    }

    return res.status(200).json({ message: `Connection request ${action}` });
  } catch (error) {
    console.error("Error responding to connection request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 8. Get Accepted Connections
const getAcceptedConnections = async (req, res) => {
  try {
    const userId = req.user.id;
    const sql = `
      SELECT c.id as connection_id, r.*, u.name 
      FROM roommate_connections c
      JOIN roommate_profiles r ON (
        (c.requester_id = r.user_id AND c.receiver_id = $1)
        OR 
        (c.receiver_id = r.user_id AND c.requester_id = $1)
      )
      JOIN users u ON r.user_id = u.id
      WHERE (c.requester_id = $1 OR c.receiver_id = $1) 
        AND c.status = 'accepted'
      ORDER BY c.updated_at DESC
    `;
    const result = await query(sql, [userId]);
    return res.status(200).json({ connections: result.rows });
  } catch (error) {
    console.error("Error fetching accepted connections:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 9. Disconnect an Accepted Connection
const disconnectRoommate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { connectionId } = req.params;
    
    // Make sure the user is part of the connection
    const deleteSql = `
      DELETE FROM roommate_connections 
      WHERE id = $1 AND (requester_id = $2 OR receiver_id = $2)
      RETURNING *
    `;
    const result = await query(deleteSql, [connectionId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Connection not found or unauthorized" });
    }
    
    const conn = result.rows[0];
    const numericUserId = Number(userId);
    const otherUserId = Number(conn.requester_id) === numericUserId ? conn.receiver_id : conn.requester_id;
    
    // Completely end communication by deleting the roommate conversation
    const delConvSql = `
      DELETE FROM conversations 
      WHERE listing_id IS NULL AND ((seeker_id = $1 AND owner_id = $2) OR (seeker_id = $2 AND owner_id = $1))
    `;
    await query(delConvSql, [userId, otherUserId]);
    
    return res.status(200).json({ message: "Disconnected successfully" });
  } catch (error) {
    console.error("Error disconnecting roommate:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getMyProfile,
  upsertProfile,
  getPotentialMatches,
  passProfile,
  sendConnectionRequest,
  getConnectionRequests,
  respondToConnectionRequest,
  getAcceptedConnections,
  disconnectRoommate
};
