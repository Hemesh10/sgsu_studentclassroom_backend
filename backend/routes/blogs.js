const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const passport = require('passport');
const blogController = require('../controllers/blog');
const { isAdmin, isStudent, isOwnerOrAdmin } = require('../middleware/rbac');

// Authentication middleware
const auth = passport.authenticate('jwt', { session: false });

// @route   POST /api/blogs
// @desc    Create a new blog
// @access  Private (Student)
router.post(
  '/',
  [
    auth,
    isStudent,
    [
      check('title', 'Title is required').not().isEmpty(),
      check('content', 'Content is required').not().isEmpty()
    ]
  ],
  blogController.createBlog
);

// @route   GET /api/blogs
// @desc    Get all blogs
// @access  Public (with filtering for status)
router.get('/', blogController.getBlogs);

// @route   GET /api/blogs/my-blogs
// @desc    Get all blogs by current user
// @access  Private
router.get('/my-blogs', auth, blogController.getMyBlogs);

// @route   GET /api/blogs/:id
// @desc    Get blog by ID
// @access  Public or Private (depending on status)
router.get('/:id', blogController.getBlogById);

// @route   PUT /api/blogs/:id
// @desc    Update blog
// @access  Private (Owner)
router.put(
  '/:id',
  [
    auth,
    isOwnerOrAdmin(async (req) => {
      const blog = await require('../models/Blog').findById(req.params.id);
      return blog ? blog.author : null;
    }),
    [
      check('title', 'Title is required').not().isEmpty(),
      check('content', 'Content is required').not().isEmpty()
    ]
  ],
  blogController.updateBlog
);

// @route   DELETE /api/blogs/:id
// @desc    Delete blog
// @access  Private (Owner or Admin)
router.delete(
  '/:id',
  auth,
  isOwnerOrAdmin(async (req) => {
    const blog = await require('../models/Blog').findById(req.params.id);
    return blog ? blog.author : null;
  }),
  blogController.deleteBlog
);

// @route   PUT /api/blogs/:id/status
// @desc    Change blog status (approve/reject)
// @access  Private (Admin only)
router.put(
  '/:id/status',
  [
    auth,
    isAdmin,
    [
      check('status', 'Status is required').isIn(['approved', 'rejected']),
      check('rejectionReason', 'Rejection reason is required when status is rejected')
        .if((value, { req }) => req.body.status === 'rejected')
        .not()
        .isEmpty()
    ]
  ],
  blogController.changeBlogStatus
);

// @route   POST /api/blogs/:id/comments
// @desc    Add comment to blog
// @access  Private
router.post(
  '/:id/comments',
  [
    auth,
    [
      check('text', 'Comment text is required').not().isEmpty()
    ]
  ],
  blogController.addComment
);

module.exports = router;