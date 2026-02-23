document.addEventListener('DOMContentLoaded', () => {

    /* -------------------------------------------------------------------------- */
    /* 5a. Page View Tracking                                                     */
    /* -------------------------------------------------------------------------- */
    const urlParams = new URLSearchParams(window.location.search);
    fetch('/api/pageview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            referrer: document.referrer || '',
            utm_source: urlParams.get('utm_source') || '',
            utm_medium: urlParams.get('utm_medium') || '',
            utm_campaign: urlParams.get('utm_campaign') || '',
            page_url: window.location.href
        })
    }).catch(err => console.error('Silent fail on tracking:', err));

    /* -------------------------------------------------------------------------- */
    /* 5b. Navbar Scroll Effect                                                   */
    /* -------------------------------------------------------------------------- */
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Trigger once on load in case we refresh down the page
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    }

    /* -------------------------------------------------------------------------- */
    /* 5c. Intersection Observer for Scroll Animations                            */
    /* -------------------------------------------------------------------------- */
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.scroll-fade-up, .scroll-slide-left, .scroll-slide-right');
    animatedElements.forEach(el => observer.observe(el));


    /* -------------------------------------------------------------------------- */
    /* 5e. A/B Testing Logic for Hero Headline                                    */
    /* -------------------------------------------------------------------------- */
    const heroHeadline = document.getElementById('ab-hero-headline');
    const hiddenHeadlineInput = document.getElementById('abHeadlineAssigned');

    const headlineVariations = [
        "Never Miss a Dose Again.", // Control
        "The Peace of Mind Pill Cap.", // Angle 1: Emotional/Anxiety
        "Automatic Reminders Without the Apps." // Angle 2: Convenience/Simplicity
    ];

    if (heroHeadline && hiddenHeadlineInput) {
        let assignedHeadline = localStorage.getItem('abTestHeadline');

        // If not assigned or somehow got corrupted
        if (!assignedHeadline || !headlineVariations.includes(assignedHeadline)) {
            const randomIndex = Math.floor(Math.random() * headlineVariations.length);
            assignedHeadline = headlineVariations[randomIndex];
            localStorage.setItem('abTestHeadline', assignedHeadline);
        }

        heroHeadline.textContent = assignedHeadline;
        hiddenHeadlineInput.value = assignedHeadline;
    }

    /* -------------------------------------------------------------------------- */
    /* 5d. Form Submission                                                        */
    /* -------------------------------------------------------------------------- */
    const waitlistForm = document.getElementById('waitlistForm');
    const submitBtn = document.getElementById('submitBtn');
    const formSuccess = document.getElementById('formSuccess');

    if (waitlistForm) {
        waitlistForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Visual feedback
            const originalBtnText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;

            const formData = new FormData(waitlistForm);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/waitlist', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    // Reset form
                    waitlistForm.reset();
                    // Refill A/B variant since it got reset
                    if (hiddenHeadlineInput && localStorage.getItem('abTestHeadline')) {
                        hiddenHeadlineInput.value = localStorage.getItem('abTestHeadline');
                    }

                    // Show success block
                    formSuccess.classList.remove('hidden');

                    // Hide after 5 seconds
                    setTimeout(() => {
                        formSuccess.classList.add('hidden');
                    }, 5000);
                } else {
                    alert('Error: ' + (result.message || 'Something went wrong.'));
                }
            } catch (err) {
                console.error(err);
                alert('An error occurred connecting to the server. Please try again.');
            } finally {
                // Restore button state
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
});
