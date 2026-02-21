// Claude Code Optimization Framework - Main JavaScript
// Modern interactions: copy, toast, theme toggle, search

// ===== Toast Notification =====
function showToast(message = 'Copied to clipboard!') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// ===== Copy DSL Shortcut =====
function copyDSL(element) {
    const text = element.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        element.classList.add('copied');
        showToast(`Copied: ${text}`);
        setTimeout(() => {
            element.classList.remove('copied');
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// ===== Copy Code Block =====
function copyCode(button) {
    const codeBlock = button.closest('.code-block, .code-example');
    const code = codeBlock.querySelector('code');
    const text = code ? code.textContent : codeBlock.querySelector('code').textContent;

    navigator.clipboard.writeText(text.trim()).then(() => {
        button.textContent = 'Copied!';
        button.classList.add('copied');
        showToast('Code copied to clipboard!');
        setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// ===== Theme Toggle =====
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;

    // Check for saved theme preference or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Apply initial theme
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }

    // Theme toggle with smooth transition
    themeToggle?.addEventListener('click', () => {
        // Add transition class
        html.style.transition = 'background-color 0.3s ease, color 0.3s ease';

        html.classList.toggle('dark');
        const isDark = html.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');

        // Remove transition after switch
        setTimeout(() => {
            html.style.transition = '';
        }, 300);
    });
});

// ===== Search Modal (Placeholder) =====
function openSearch() {
    // TODO: Implement command palette search
    showToast('Search coming soon! Use Ctrl+F for now.');
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
    }
});

// ===== Smooth Scroll =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== Intersection Observer for Animations =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe cards and sections
document.querySelectorAll('.card, section > div').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// ===== Active Navigation =====
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        if (window.pageYOffset >= sectionTop) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// ===== Console Welcome =====
console.log('%c⚡ Claude Code Optimization Framework', 'font-size: 20px; font-weight: bold; color: #6366f1;');
console.log('%cVersion 1.2.0 • 103 Skills | https://github.com/ERP-CORE-DEV', 'color: #94a3b8;');
