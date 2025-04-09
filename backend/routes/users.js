const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const passport = require('passport');
const userController = require('../controllers/user');
const { isAdmin } = require('../middleware/rbac');

// Authentication middleware
const auth = passport.authenticate('jwt', { session: false });

// @route   GET /api/users
// @desc    Get all users (admin)
// @access  Private (Admin)
router.get('/', [auth, isAdmin], userController.getAllUsers);

// @route   GET /api/users/stats
// @desc    Get user statistics (admin)
// @access  Private (Admin)
router.get('/stats', [auth, isAdmin], userController.getUserStats);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin)
router.get('/:id', [auth, isAdmin], userController.getUserById);

// @route   PUT /api/users/:id
// @desc    Update user (admin)
// @access  Private (Admin)
router.put(
  '/:id',
  [
    auth,
    isAdmin,
    [
      check('name', 'Name must not be empty').optional().not().isEmpty(),
      check('email', 'Please include a valid email').optional().isEmail(),
      check('role', 'Role must be either student or admin').optional().isIn(['student', 'admin']),
      check('isActive', 'Active status must be a boolean').optional().isBoolean(),
      check('isVerified', 'Verified status must be a boolean').optional().isBoolean()
    ]
  ],
  userController.updateUser
);

// @route   DELETE /api/users/:id
// @desc    Delete user (admin)
// @access  Private (Admin)
router.delete('/:id', [auth, isAdmin], userController.deleteUser);

// @route   PUT /api/users/:id/make-admin
// @desc    Make user admin
// @access  Private (Admin)
router.put('/:id/make-admin', [auth, isAdmin], userController.makeAdmin);

module.exports = router;