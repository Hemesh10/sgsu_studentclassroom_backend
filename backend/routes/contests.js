const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const passport = require('passport');
const contestController = require('../controllers/contest');
const { isAdmin, isStudent } = require('../middleware/rbac');

// Authentication middleware
const auth = passport.authenticate('jwt', { session: false });

// @route   POST /api/contests
// @desc    Create a new contest
// @access  Private (Admin)
router.post(
  '/',
  [
    auth,
    isAdmin,
    [
      check('title', 'Title is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('startDate', 'Start date is required').isISO8601(),
      check('endDate', 'End date is required').isISO8601(),
      check('registrationDeadline', 'Registration deadline is required').isISO8601(),
      check('category', 'Category is required').not().isEmpty()
    ]
  ],
  contestController.createContest
);

// @route   GET /api/contests
// @desc    Get all contests
// @access  Public
router.get('/', contestController.getContests);

// @route   GET /api/contests/my-contests
// @desc    Get registered contests for current user
// @access  Private
router.get('/my-contests', auth, contestController.getMyContests);

// @route   GET /api/contests/:id
// @desc    Get contest by ID
// @access  Public
router.get('/:id', contestController.getContestById);

// @route   PUT /api/contests/:id
// @desc    Update contest
// @access  Private (Admin)
router.put(
  '/:id',
  [
    auth,
    isAdmin,
    [
      check('title', 'Title is required').optional().not().isEmpty(),
      check('description', 'Description is required').optional().not().isEmpty(),
      check('startDate', 'Start date must be a valid date').optional().isISO8601(),
      check('endDate', 'End date must be a valid date').optional().isISO8601(),
      check('registrationDeadline', 'Registration deadline must be a valid date').optional().isISO8601(),
      check('entryFee', 'Entry fee must be a number').optional().isNumeric(),
      check('maxParticipants', 'Maximum participants must be a number').optional().isNumeric(),
      check('status', 'Status must be valid').optional().isIn(['upcoming', 'ongoing', 'completed', 'cancelled']),
      check('isActive', 'Active status must be a boolean').optional().isBoolean()
    ]
  ],
  contestController.updateContest
);

// @route   POST /api/contests/:id/register
// @desc    Register for contest
// @access  Private (Student)
router.post(
  '/:id/register',
  [auth, isStudent],
  contestController.registerForContest
);

module.exports = router;