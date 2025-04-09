const { validationResult } = require('express-validator');
const Contest = require('../models/Contest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Payment = require('../models/Payment');

// @desc    Create a new contest
// @route   POST /api/contests
// @access  Private (Admin)
exports.createContest = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      description,
      startDate,
      endDate,
      registrationDeadline,
      entryFee,
      maxParticipants,
      location,
      category,
      featuredImage
    } = req.body;

    // Create new contest
    const newContest = new Contest({
      title,
      description,
      startDate,
      endDate,
      registrationDeadline,
      entryFee: entryFee || 0,
      maxParticipants: maxParticipants || null,
      location: location || 'Online',
      category,
      organizers: [req.user.id], // Admin who creates is the first organizer
      status: 'upcoming',
      isActive: true
    });

    // Add featured image if provided
    if (featuredImage) {
      newContest.featuredImage = featuredImage;
    }

    await newContest.save();

    // Notify all students about new contest
    const students = await User.find({ role: 'student' }).select('_id');

    if (students.length > 0) {
      const notification = new Notification({
        title: 'New Contest Announced',
        message: `A new contest "${title}" has been announced. Registration is open until ${new Date(registrationDeadline).toLocaleDateString()}.`,
        sender: req.user.id,
        recipients: 'specific',
        targetUsers: students.map(student => student._id),
        urgencyLevel: 'important',
        relatedTo: 'contest',
        relatedId: newContest._id,
        notificationType: 'Contest'
      });

      await notification.save();

      // Send real-time notification via Socket.io
      const io = req.app.get('io');
      students.forEach(student => {
        io.to(student._id.toString()).emit('notification', {
          type: 'NEW_CONTEST',
          message: `New contest "${title}" announced`,
          data: notification
        });
      });
    }

    res.status(201).json({
      message: 'Contest created successfully',
      contest: newContest
    });
  } catch (error) {
    console.error('Create contest error:', error.message);
    next(error);
  }
};

// @desc    Get all contests
// @route   GET /api/contests
// @access  Public
exports.getContests = async (req, res, next) => {
  try {
    const { status, category, search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    const query = { isActive: true };

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Search in title and description
    if (search) {
      query.$text = { $search: search };
    }

    // Get contests with pagination
    const contests = await Contest.find(query)
      .populate('organizers', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Update status based on dates for each contest
    await Promise.all(contests.map(contest => contest.updateStatus()));

    // Get total count for pagination
    const total = await Contest.countDocuments(query);

    res.json({
      contests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get contests error:', error.message);
    next(error);
  }
};

// @desc    Get contest by ID
// @route   GET /api/contests/:id
// @access  Public
exports.getContestById = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('organizers', 'name avatar')
      .populate('participants.user', 'name avatar');

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Update status based on dates
    await contest.updateStatus();

    // Check if user is registered
    let isRegistered = false;
    let registrationStatus = null;

    if (req.user) {
      const participant = contest.participants.find(
        p => p.user._id.toString() === req.user.id
      );
      
      if (participant) {
        isRegistered = true;
        registrationStatus = participant.paymentStatus;
      }
    }

    res.json({
      contest,
      isRegistered,
      registrationStatus
    });
  } catch (error) {
    console.error('Get contest by ID error:', error.message);
    next(error);
  }
};

// @desc    Update contest
// @route   PUT /api/contests/:id
// @access  Private (Admin)
exports.updateContest = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      description,
      startDate,
      endDate,
      registrationDeadline,
      entryFee,
      maxParticipants,
      location,
      category,
      featuredImage,
      status,
      isActive
    } = req.body;

    let contest = await Contest.findById(req.params.id);

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Update fields
    if (title) contest.title = title;
    if (description) contest.description = description;
    if (startDate) contest.startDate = startDate;
    if (endDate) contest.endDate = endDate;
    if (registrationDeadline) contest.registrationDeadline = registrationDeadline;
    if (entryFee !== undefined) contest.entryFee = entryFee;
    if (maxParticipants !== undefined) contest.maxParticipants = maxParticipants;
    if (location) contest.location = location;
    if (category) contest.category = category;
    if (featuredImage) contest.featuredImage = featuredImage;
    if (status) contest.status = status;
    if (isActive !== undefined) contest.isActive = isActive;

    await contest.save();

    // Notify registered participants about changes
    if (contest.participants.length > 0) {
      const participantIds = contest.participants.map(p => p.user);
      
      const notification = new Notification({
        title: 'Contest Updated',
        message: `The contest "${contest.title}" has been updated. Please check the details.`,
        sender: req.user.id,
        recipients: 'specific',
        targetUsers: participantIds,
        urgencyLevel: 'important',
        relatedTo: 'contest',
        relatedId: contest._id,
        notificationType: 'Contest'
      });

      await notification.save();

      // Send real-time notification
      const io = req.app.get('io');
      participantIds.forEach(userId => {
        io.to(userId.toString()).emit('notification', {
          type: 'CONTEST_UPDATE',
          message: `Contest "${contest.title}" has been updated`,
          data: notification
        });
      });
    }

    res.json({
      message: 'Contest updated successfully',
      contest
    });
  } catch (error) {
    console.error('Update contest error:', error.message);
    next(error);
  }
};

// @desc    Register for contest
// @route   POST /api/contests/:id/register
// @access  Private (Student)
exports.registerForContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if contest registration is open
    if (!contest.isRegistrationOpen) {
      return res.status(400).json({ message: 'Registration for this contest is closed' });
    }

    // Check if contest is full
    if (contest.isFull()) {
      return res.status(400).json({ message: 'This contest has reached maximum participants' });
    }

    // Check if user is already registered
    const alreadyRegistered = contest.participants.some(
      p => p.user.toString() === req.user.id
    );

    if (alreadyRegistered) {
      return res.status(400).json({ message: 'You are already registered for this contest' });
    }

    // If contest has entry fee, create a payment record
    let payment = null;
    if (contest.entryFee > 0) {
      payment = new Payment({
        user: req.user.id,
        amount: contest.entryFee,
        purpose: 'contest',
        relatedTo: contest._id,
        relatedModel: 'Contest',
        status: 'pending'
      });

      await payment.save();
    }

    // Add user to participants
    contest.participants.push({
      user: req.user.id,
      registeredAt: new Date(),
      paymentStatus: contest.entryFee > 0 ? 'pending' : 'completed',
      paymentId: payment ? payment._id : null
    });

    await contest.save();

    // Add contest to user's contests
    await User.findByIdAndUpdate(req.user.id, {
      $push: { contests: contest._id }
    });

    // Return payment details if there's a fee
    const result = {
      message: 'Registration successful',
      contest: contest._id,
      paymentRequired: contest.entryFee > 0,
      paymentStatus: contest.entryFee > 0 ? 'pending' : 'completed'
    };

    if (payment) {
      result.payment = {
        id: payment._id,
        amount: payment.amount,
        status: payment.status
      };
    }

    res.json(result);
  } catch (error) {
    console.error('Register for contest error:', error.message);
    next(error);
  }
};

// @desc    Get registered contests for current user
// @route   GET /api/contests/my-contests
// @access  Private
exports.getMyContests = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Find contests where the user is a participant
    const query = { 'participants.user': req.user.id };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Get contests with pagination
    const contests = await Contest.find(query)
      .populate('organizers', 'name avatar')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get registration and payment details for each contest
    const contestsWithDetails = contests.map(contest => {
      const participant = contest.participants.find(
        p => p.user.toString() === req.user.id
      );

      return {
        ...contest.toObject(),
        registrationDetails: {
          registeredAt: participant.registeredAt,
          paymentStatus: participant.paymentStatus
        }
      };
    });

    // Get total count for pagination
    const total = await Contest.countDocuments(query);

    res.json({
      contests: contestsWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my contests error:', error.message);
    next(error);
  }
};