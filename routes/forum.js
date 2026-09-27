const express = require("express");
const router = express.Router();
const { query } = require("../db");
const authMiddleware = require("../middleware/auth");
const {
  validateForumTitle, validateForumContent, validateStringLength,
} = require("../utils/validators");
const { sanitizeHtml } = require("../utils/sanitize");

// GET /api/forum/posts - Fetch all posts
router.get("/posts", async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let baseQuery = `
      SELECT 
        p.*, 
        u.name as author_name, 
        (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) as replies_count,
        (SELECT COUNT(*) FROM forum_upvotes u2 WHERE u2.post_id = p.id) as upvotes_count
      FROM forum_posts p
      JOIN users u ON p.author_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (category && category !== "All Topics") {
      baseQuery += ` AND p.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      // Strip SQL wildcard characters to prevent DoS attacks via intentionally slow queries
      const safeSearch = search.replace(/[%_]/g, '');
      baseQuery += ` AND (p.title ILIKE $${paramIndex} OR p.excerpt ILIKE $${paramIndex})`;
      params.push(`%${safeSearch}%`);
      paramIndex++;
    }

    baseQuery += ` ORDER BY p.created_at DESC`;

    const result = await query(baseQuery, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching forum posts:", error);
    res.status(500).json({ error: "Failed to fetch forum posts" });
  }
});

// GET /api/forum/posts/:id - Fetch single post with comments
router.get("/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Increment views
    await query(`UPDATE forum_posts SET views = views + 1 WHERE id = $1`, [id]);

    const postResult = await query(`
      SELECT 
        p.*, 
        u.name as author_name, 
        (SELECT COUNT(*) FROM forum_upvotes u2 WHERE u2.post_id = p.id) as upvotes_count
      FROM forum_posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.id = $1
    `, [id]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const commentsResult = await query(`
      SELECT c.*, u.name as author_name 
      FROM forum_comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `, [id]);

    res.json({
      ...postResult.rows[0],
      comments: commentsResult.rows
    });
  } catch (error) {
    console.error("Error fetching single post:", error);
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

// POST /api/forum/posts - Create a new post
router.post("/posts", authMiddleware, async (req, res) => {
  try {
    const { title, excerpt, content, category } = req.body;
    const author_id = req.user.id; // from authMiddleware

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    // ── Input validation & sanitization ──
    const sanitizedTitle = sanitizeHtml(title);
    const sanitizedContent = sanitizeHtml(content);
    const sanitizedExcerpt = excerpt ? sanitizeHtml(excerpt) : sanitizedContent.substring(0, 150);

    const titleCheck = validateForumTitle(sanitizedTitle);
    if (!titleCheck.valid) return res.status(400).json({ error: titleCheck.message });
    const contentCheck = validateForumContent(sanitizedContent);
    if (!contentCheck.valid) return res.status(400).json({ error: contentCheck.message });

    const result = await query(`
      INSERT INTO forum_posts (author_id, title, excerpt, content, category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [author_id, sanitizedTitle, sanitizedExcerpt, sanitizedContent, category || 'General Discussion']);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// POST /api/forum/posts/:id/comments - Add a comment
router.post("/posts/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { id: post_id } = req.params;
    const { content } = req.body;
    const author_id = req.user.id;

    if (!content) {
      return res.status(400).json({ error: "Comment content is required" });
    }

    // ── Input validation & sanitization ──
    const sanitizedContent = sanitizeHtml(content);

    const commentCheck = validateForumContent(sanitizedContent);
    if (!commentCheck.valid) return res.status(400).json({ error: commentCheck.message });

    const result = await query(`
      INSERT INTO forum_comments (post_id, author_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [post_id, author_id, sanitizedContent]);

    // Fetch the new comment with author info
    const commentResult = await query(`
      SELECT c.*, u.name as author_name 
      FROM forum_comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.id = $1
    `, [result.rows[0].id]);

    res.status(201).json(commentResult.rows[0]);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// POST /api/forum/posts/:id/upvote - Toggle upvote
router.post("/posts/:id/upvote", authMiddleware, async (req, res) => {
  try {
    const { id: post_id } = req.params;
    const user_id = req.user.id;

    // Check if upvote exists
    const existing = await query(`
      SELECT * FROM forum_upvotes WHERE post_id = $1 AND user_id = $2
    `, [post_id, user_id]);

    if (existing.rows.length > 0) {
      // Remove upvote
      await query(`
        DELETE FROM forum_upvotes WHERE post_id = $1 AND user_id = $2
      `, [post_id, user_id]);
      res.json({ message: "Upvote removed", upvoted: false });
    } else {
      // Add upvote
      await query(`
        INSERT INTO forum_upvotes (post_id, user_id) VALUES ($1, $2)
      `, [post_id, user_id]);
      res.json({ message: "Upvoted", upvoted: true });
    }
  } catch (error) {
    console.error("Error toggling upvote:", error);
    res.status(500).json({ error: "Failed to toggle upvote" });
  }
});

module.exports = router;
