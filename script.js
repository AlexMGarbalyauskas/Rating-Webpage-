// Storage key for localStorage
const STORAGE_KEY = 'projectRatings';

// DOM Elements
const ratingForm = document.getElementById('ratingForm');
const starRating = document.getElementById('starRating');
const stars = document.querySelectorAll('.star');
const ratingInput = document.getElementById('rating');
const ratingText = document.getElementById('ratingText');
const reviewsContainer = document.getElementById('reviewsContainer');
const filterButtons = document.querySelectorAll('.filter-btn');
const reviewCount = document.getElementById('reviewCount');

// Current filter
let currentFilter = 'all';

// Star Rating Interaction
stars.forEach(star => {
    star.addEventListener('click', () => {
        const value = star.dataset.value;
        ratingInput.value = value;
        updateStarDisplay(value);
        updateRatingText(value);
    });

    star.addEventListener('mouseenter', () => {
        const value = star.dataset.value;
        stars.forEach((s, index) => {
            if (index < value) {
                s.classList.add('hover');
            } else {
                s.classList.remove('hover');
            }
        });
    });
});

starRating.addEventListener('mouseleave', () => {
    stars.forEach(s => s.classList.remove('hover'));
    if (ratingInput.value) {
        updateStarDisplay(ratingInput.value);
    }
});

function updateStarDisplay(value) {
    stars.forEach((star, index) => {
        if (index < value) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function updateRatingText(value) {
    const ratings = {
        1: 'Poor 😞',
        2: 'Fair 😐',
        3: 'Good 😊',
        4: 'Very Good 😄',
        5: 'Excellent 🤩'
    };
    ratingText.textContent = ratings[value];
}

// Form Submission
ratingForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!ratingInput.value) {
        showToast('Please select a rating', 'error');
        return;
    }

    const formData = {
        id: Date.now(),
        rating: parseInt(ratingInput.value),
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        comment: document.getElementById('comment').value.trim(),
        date: new Date().toISOString()
    };

    // Save to localStorage
    saveReview(formData);

    // Reset form
    ratingForm.reset();
    ratingInput.value = '';
    stars.forEach(s => s.classList.remove('active'));
    ratingText.textContent = 'Select a rating';

    // Show success message
    showToast('Thank you for your feedback! 🎉');

    // Refresh display
    displayReviews();
    updateStatistics();
});

// Save review to localStorage
function saveReview(review) {
    const reviews = getReviews();
    reviews.push(review);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

// Get all reviews from localStorage
function getReviews() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// Delete review
function deleteReview(id) {
    if (confirm('Are you sure you want to delete this review?')) {
        let reviews = getReviews();
        reviews = reviews.filter(review => review.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
        displayReviews();
        updateStatistics();
        showToast('Review deleted successfully');
    }
}

// Display reviews
function displayReviews() {
    const reviews = getReviews();
    
    // Filter reviews
    let filteredReviews = reviews;
    if (currentFilter !== 'all') {
        filteredReviews = reviews.filter(review => review.rating === parseInt(currentFilter));
    }

    // Sort by date (newest first)
    filteredReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update review count
    reviewCount.textContent = `(${reviews.length})`;

    // Display reviews
    if (filteredReviews.length === 0) {
        reviewsContainer.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to share your feedback!</p>';
        return;
    }

    reviewsContainer.innerHTML = filteredReviews.map(review => {
        const date = new Date(review.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

        return `
            <div class="review-card">
                <div class="review-header">
                    <div class="review-info">
                        <h3>${escapeHtml(review.name)}</h3>
                        <p>${escapeHtml(review.email)}</p>
                    </div>
                    <div>
                        <div class="review-rating">${stars}</div>
                        <div class="review-date">${formattedDate}</div>
                    </div>
                </div>
                <div class="review-comment">${escapeHtml(review.comment)}</div>
            </div>
        `;
    }).join('');
}

// Update statistics
function updateStatistics() {
    const reviews = getReviews();

    if (reviews.length === 0) {
        document.getElementById('avgRating').textContent = '0.0';
        document.getElementById('totalReviews').textContent = '0';
        for (let i = 1; i <= 5; i++) {
            document.getElementById(`progress-${i}`).style.width = '0%';
            document.getElementById(`count-${i}`).textContent = '0';
        }
        return;
    }

    // Calculate average rating
    const avgRating = (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1);
    document.getElementById('avgRating').textContent = avgRating;
    document.getElementById('totalReviews').textContent = reviews.length;

    // Calculate rating breakdown
    const ratingCounts = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
    };

    reviews.forEach(review => {
        ratingCounts[review.rating]++;
    });

    // Update progress bars and counts
    for (let i = 5; i >= 1; i--) {
        const count = ratingCounts[i];
        const percentage = (count / reviews.length) * 100;
        document.getElementById(`progress-${i}`).style.width = percentage + '%';
        document.getElementById(`count-${i}`).textContent = count;
    }
}

// Filter reviews
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        displayReviews();
    });
});

// Utility function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// Initialize app
function init() {
    displayReviews();
    updateStatistics();
}

// Run on page load
document.addEventListener('DOMContentLoaded', init);
