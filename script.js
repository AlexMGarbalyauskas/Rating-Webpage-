import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    where,
    limit as fbLimit,
    startAfter,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Storage key for localStorage (fallback)
const STORAGE_KEY = 'projectRatings';

// Firebase setup (optional)
const firebaseConfig = window.FIREBASE_CONFIG;
const isFirebaseEnabled = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId;
let firestoreDb = null;

if (isFirebaseEnabled) {
    const app = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app);
}

// DOM Elements
const ratingForm = document.getElementById('ratingForm');
const starRating = document.getElementById('starRating');
const stars = document.querySelectorAll('.star');
const ratingInput = document.getElementById('rating');
const ratingText = document.getElementById('ratingText');
const reviewsContainer = document.getElementById('reviewsContainer');
const filterButtons = document.querySelectorAll('.filter-btn');
const reviewCount = document.getElementById('reviewCount');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const clearReviewsBtn = document.getElementById('clearReviewsBtn');

// Current filter
let currentFilter = 'all';
const REVIEWS_PAGE_SIZE = 10;
let currentPage = 1;
// Firestore pagination state
let fetchedReviews = [];
let lastVisible = null;
let hasMore = true;

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

// Admin mode detection
const isAdmin = new URLSearchParams(window.location.search).get('admin') === '1';
if (isAdmin && clearReviewsBtn) {
    clearReviewsBtn.style.display = 'inline-block';
    clearReviewsBtn.addEventListener('click', async () => {
        if (!confirm('Delete all reviews permanently? This cannot be undone.')) return;

        // Delete from Firestore if enabled
        if (isFirebaseEnabled && firestoreDb) {
            const reviewsRef = collection(firestoreDb, 'reviews');
            const snapshot = await getDocs(query(reviewsRef, orderBy('date', 'desc')));
            const deletes = snapshot.docs.map(d => deleteDoc(doc(firestoreDb, 'reviews', d.id)));
            await Promise.all(deletes);
        }

        // Clear localStorage fallback
        localStorage.removeItem(STORAGE_KEY);

        // Reset pagination and refresh
        fetchedReviews = [];
        lastVisible = null;
        hasMore = true;
        currentPage = 1;
        await displayReviews();
        await updateStatistics();
        showToast('All reviews deleted');
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
ratingForm.addEventListener('submit', async (e) => {
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

    // Save review (cloud if configured, otherwise localStorage)
    await saveReview(formData);

    // Reset form
    ratingForm.reset();
    ratingInput.value = '';
    stars.forEach(s => s.classList.remove('active'));
    ratingText.textContent = 'Select a rating';

    // Show success message
    showToast('Thank you for your feedback! 🎉');

    // Refresh display and reset pagination for Firestore
    currentPage = 1;
    fetchedReviews = [];
    lastVisible = null;
    hasMore = true;
    await displayReviews();
    await updateStatistics();
});

// Save review (cloud if configured, otherwise localStorage)
async function saveReview(review) {
    if (isFirebaseEnabled && firestoreDb) {
        await addDoc(collection(firestoreDb, 'reviews'), {
            rating: review.rating,
            name: review.name,
            email: review.email,
            comment: review.comment,
            date: serverTimestamp()
        });
        return;
    }

    const reviews = await getReviews();
    reviews.push(review);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

// Get all reviews (cloud if configured, otherwise localStorage)
async function getReviews() {
    // This function is kept for localStorage fallback only.
    if (isFirebaseEnabled && firestoreDb) {
        // For backward compatibility, fetch first page only
        const reviewsRef = collection(firestoreDb, 'reviews');
        const reviewsQuery = query(reviewsRef, orderBy('date', 'desc'), fbLimit(REVIEWS_PAGE_SIZE));
        const snapshot = await getDocs(reviewsQuery);
        return snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
            date: docSnap.data().date && docSnap.data().date.toDate ? docSnap.data().date.toDate().toISOString() : docSnap.data().date
        }));
    }

    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// Fetch next page of reviews for current filter (Firestore)
async function fetchMoreReviewsForCurrentFilter() {
    if (!isFirebaseEnabled || !firestoreDb || !hasMore) return [];

    const reviewsRef = collection(firestoreDb, 'reviews');
    const constraints = [];

    if (currentFilter !== 'all') {
        constraints.push(where('rating', '==', parseInt(currentFilter)));
    }

    constraints.push(orderBy('date', 'desc'));
    constraints.push(fbLimit(REVIEWS_PAGE_SIZE));

    if (lastVisible) {
        constraints.push(startAfter(lastVisible));
    }

    const reviewsQuery = query(reviewsRef, ...constraints);
    const snapshot = await getDocs(reviewsQuery);

    if (snapshot.empty) {
        hasMore = false;
        return [];
    }

    lastVisible = snapshot.docs[snapshot.docs.length - 1];

    const docs = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        date: docSnap.data().date && docSnap.data().date.toDate ? docSnap.data().date.toDate().toISOString() : docSnap.data().date
    }));

    fetchedReviews = fetchedReviews.concat(docs);
    if (docs.length < REVIEWS_PAGE_SIZE) hasMore = false;
    return docs;
}

// Delete review
async function deleteReview(id) {
    if (confirm('Are you sure you want to delete this review?')) {
        if (isFirebaseEnabled && firestoreDb) {
            await deleteDoc(doc(firestoreDb, 'reviews', id));
            // reset pagination so UI reloads fresh data
            fetchedReviews = [];
            lastVisible = null;
            hasMore = true;
        } else {
            let reviews = await getReviews();
            reviews = reviews.filter(review => review.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
        }
        await displayReviews();
        await updateStatistics();
        showToast('Review deleted successfully');
    }
}

// Display reviews
async function displayReviews() {
    // If Firestore is enabled, use paginated fetchedReviews; otherwise use localStorage full list
    if (isFirebaseEnabled && firestoreDb) {
        // Ensure we have enough items for current page
        const endIndex = currentPage * REVIEWS_PAGE_SIZE;
        while (fetchedReviews.length < endIndex && hasMore) {
            await fetchMoreReviewsForCurrentFilter();
        }

        if (fetchedReviews.length === 0) {
            reviewsContainer.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to share your feedback!</p>';
            reviewCount.textContent = `(0)`;
            updateLoadMoreVisibility(0, 0);
            return;
        }

        const pageReviews = fetchedReviews.slice(0, endIndex);

        reviewsContainer.innerHTML = pageReviews.map(review => {
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
                    ${isAdmin ? `<button class="btn-delete" data-id="${review.id}" style="margin-left:12px;background:#ff6b6b;border:none;padding:6px 10px;border-radius:6px;color:white;cursor:pointer">Delete</button>` : ''}
                </div>
                <div class="review-comment">${escapeHtml(review.comment)}</div>
            </div>
        `;
        }).join('');

        // show count; if there are more pages, show +
        reviewCount.textContent = `(${fetchedReviews.length}${hasMore ? '+' : ''})`;
        updateLoadMoreVisibility(pageReviews.length, fetchedReviews.length + (hasMore ? 1 : 0));
            // attach delete handlers for admin
            if (isAdmin) {
                const dels = document.querySelectorAll('.btn-delete');
                dels.forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = btn.dataset.id;
                        await deleteReview(id);
                    });
                });
            }
            return;
    }

    // localStorage fallback
    const reviews = await getReviews();
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
        updateLoadMoreVisibility(0, 0);
        return;
    }

    const endIndex = currentPage * REVIEWS_PAGE_SIZE;
    const pageReviews = filteredReviews.slice(0, endIndex);

    reviewsContainer.innerHTML = pageReviews.map(review => {
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
                    ${isAdmin ? `<button class="btn-delete" data-id="${review.id}" style="margin-left:12px;background:#ff6b6b;border:none;padding:6px 10px;border-radius:6px;color:white;cursor:pointer">Delete</button>` : ''}
                </div>
                <div class="review-comment">${escapeHtml(review.comment)}</div>
            </div>
        `;
    }).join('');

    updateLoadMoreVisibility(pageReviews.length, filteredReviews.length);
    // attach delete handlers for admin (local mode)
    if (isAdmin) {
        const dels = document.querySelectorAll('.btn-delete');
        dels.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.dataset.id;
                await deleteReview(id);
            });
        });
    }
}

// Update statistics
async function updateStatistics() {
    let reviews = [];
    if (isFirebaseEnabled && firestoreDb) {
        // fetch all reviews for accurate stats (acceptable for small datasets)
        const reviewsRef = collection(firestoreDb, 'reviews');
        const snapshot = await getDocs(query(reviewsRef, orderBy('date', 'desc')));
        reviews = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
            date: docSnap.data().date && docSnap.data().date.toDate ? docSnap.data().date.toDate().toISOString() : docSnap.data().date
        }));
    } else {
        reviews = await getReviews();
    }

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
    btn.addEventListener('click', async () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        currentPage = 1;
        // Reset Firestore pagination state for new filter
        fetchedReviews = [];
        lastVisible = null;
        hasMore = true;
        await displayReviews();
    });
});

// Load more reviews
if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
        currentPage += 1;
        await displayReviews();
    });
}

function updateLoadMoreVisibility(shownCount, totalCount) {
    if (!loadMoreBtn) return;
    if (shownCount >= totalCount) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'inline-block';
    }
}

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
async function init() {
    await displayReviews();
    await updateStatistics();
}

// Run on page load
document.addEventListener('DOMContentLoaded', init);
