// 1. Initialize Lenis (Smooth Scroll) - Optimized Integration
const lenis = new Lenis({
    duration: 1.3,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
});
// Connect Lenis to GSAP Ticker for perfect sync (Fixes Jitter/Lag)
gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
});
// Disable GSAP lag smoothing to prevent conflicts with Lenis
gsap.ticker.lagSmoothing(0);

// Register plugins. SplitText was a paid Club GSAP plugin until GSAP went
// 100% free — it's used below for real char/word splitting with a built-in
// masked reveal, but only if its script tag is present. Everything here
// falls back cleanly to the hand-rolled span-splitter further down when
// it isn't, so nothing breaks if that tag is never added.
const HAS_SPLIT_TEXT = typeof SplitText !== 'undefined';
gsap.registerPlugin(ScrollTrigger, TextPlugin, ...(HAS_SPLIT_TEXT ? [SplitText] : []));

// ---------------------------------------------------------------------
// Shared word-splitter (vanilla — no external plugin/CDN involved, so
// there's nothing here that can silently fail to load). Wraps each word
// in its own inline span and hands back a revert() to restore the
// original text/attribute state. Used by the Why section, and reused as
// the SplitText fallback anywhere else that wants a per-word reveal.
// ---------------------------------------------------------------------
function splitIntoWordSpans(el) {
    const original = el.textContent;
    const words = original.trim().split(/\s+/);
    el.textContent = '';
    const frag = document.createDocumentFragment();
    const spans = words.map((w) => {
        const s = document.createElement('span');
        s.className = 'word';
        s.textContent = w;
        frag.append(s, document.createTextNode(' '));
        return s;
    });
    el.appendChild(frag);
    el.setAttribute('aria-label', original);
    return {
        words: spans,
        revert: () => {
            el.removeAttribute('aria-label');
            el.textContent = original;
        }
    };
}

// 2. Custom Cursor Logic (Magnetic + scroll-velocity reactive)
const cursorDot = document.querySelector('.cursor-dot');
const cursorOutline = document.querySelector('.cursor-outline');
let mouseX = 0, mouseY = 0;
let cursorX = 0, cursorY = 0;
window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    // Dot follows instantly
    gsap.to(cursorDot, { x: mouseX, y: mouseY, duration: 0 });
});
// Smooth outline follow loop
function animateCursor() {
    let dt = 0.2; // ease factor
    cursorX += (mouseX - cursorX) * dt;
    cursorY += (mouseY - cursorY) * dt;
    cursorOutline.style.left = cursorX + "px";
    cursorOutline.style.top = cursorY + "px";
    requestAnimationFrame(animateCursor);
}
animateCursor();
// Magnetic Buttons — slightly stronger pull + a touch of rotation so the
// button feels like it has real weight being dragged toward the pointer,
// not just sliding on rails.
const magneticBtns = document.querySelectorAll('.magnetic-btn');
magneticBtns.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        gsap.to(btn, { x: x * 0.35, y: y * 0.35, rotate: x * 0.02, duration: 0.4, ease: "power3.out" });
        gsap.to(cursorOutline, { scale: 1.5, opacity: 0.5, duration: 0.3 });
    });
    btn.addEventListener('mouseleave', () => {
        gsap.to(btn, { x: 0, y: 0, rotate: 0, duration: 0.5, ease: "elastic.out(1, 0.5)" });
        gsap.to(cursorOutline, { scale: 1, opacity: 1, duration: 0.3 });
    });
});

// 2b. Scroll-velocity reactive cursor — this is what now carries the
// "sense of momentum" that the old fixed top progress bar used to hint at,
// without reintroducing a loading-bar-style element. As the page scrolls
// faster, the cursor ring stretches slightly along the scroll direction and
// eases back to a perfect circle the moment scrolling settles.
function initVelocityCursor() {
    if (!cursorOutline) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    ScrollTrigger.create({
        trigger: document.documentElement,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
            const v = self.getVelocity() / 2500; // normalize
            const stretch = gsap.utils.clamp(-0.6, 0.6, v);
            gsap.to(cursorOutline, {
                scaleY: 1 + Math.abs(stretch) * 0.35,
                scaleX: 1 - Math.abs(stretch) * 0.15,
                duration: 0.3,
                overwrite: 'auto',
                onComplete: () => gsap.to(cursorOutline, { scaleX: 1, scaleY: 1, duration: 0.6, ease: "elastic.out(1, 0.4)" })
            });
        }
    });
}
initVelocityCursor();

// 3. Loader Sequence & Initialization
// Rebuilt as ONE master timeline instead of four independent, competing
// clocks (letter stagger tween, a setInterval cycling the role line,
// the progress counter tween, and the curtain exit). Previously the role
// line's setInterval kept swapping text underneath — and even after —
// the curtain wipe, because it was only ever cleared in the whole
// timeline's onComplete. That mismatch between "the counter says done"
// and "the role text is still flipping" is what read as slow/unfinished.
// Everything below shares one clock and stops together.
window.addEventListener("load", () => {
    // Make body visible (CSS hid it to prevent FOUC)
    gsap.set("body", { autoAlpha: 1 });
    // Explicitly set initial states for hero elements to avoid CSS conflicts
    gsap.set(".hero-reveal", { y: 110, autoAlpha: 0, scale: 0.97 });
    gsap.set(".hero-img-container", { scale: 0.88, autoAlpha: 0 });
    gsap.set("#navbar", { autoAlpha: 0, y: -20 });

    const loaderNameEl = document.getElementById('loader-name');
    const loaderRoleEl = document.getElementById('loader-role');
    let nameUnits = [];
    let nameSplit = null;

    if (loaderNameEl) {
        const fullName = loaderNameEl.textContent;
        if (HAS_SPLIT_TEXT) {
            // Real SplitText: masked chars give a clean vertical wipe with
            // no risk of a descender (like a lowercase "g") poking out of
            // its own clip box mid-animation.
            nameSplit = SplitText.create(loaderNameEl, { type: "chars", mask: "chars", charsClass: "loader-letter" });
            nameUnits = nameSplit.chars;
        } else {
            loaderNameEl.setAttribute('aria-label', fullName);
            const frag = document.createDocumentFragment();
            [...fullName].forEach((ch) => {
                const span = document.createElement('span');
                span.className = 'loader-letter';
                span.setAttribute('aria-hidden', 'true');
                span.textContent = ch === ' ' ? '\u00A0' : ch;
                frag.appendChild(span);
            });
            loaderNameEl.textContent = '';
            loaderNameEl.appendChild(frag);
            nameUnits = loaderNameEl.querySelectorAll('.loader-letter');
        }
        gsap.set(nameUnits, { yPercent: 130, opacity: 0, rotate: 8 });
    }

    const loaderRoles = ["Frontend Engineer", "Software Engineer", "React · GSAP · Node", "Building With Purpose"];
    let roleIndex = 0;
    let roleInterval = null;
    function startRoleCycle() {
        if (!loaderRoleEl) return;
        roleInterval = setInterval(() => {
            roleIndex = (roleIndex + 1) % loaderRoles.length;
            gsap.to(loaderRoleEl, {
                yPercent: -110, opacity: 0, duration: 0.26, ease: "power2.in",
                onComplete: () => {
                    loaderRoleEl.textContent = loaderRoles[roleIndex];
                    gsap.fromTo(loaderRoleEl,
                        { yPercent: 110, opacity: 0 },
                        { yPercent: 0, opacity: 1, duration: 0.3, ease: "power3.out" }
                    );
                }
            });
        }, 500);
    }
    function stopRoleCycle() {
        if (roleInterval) { clearInterval(roleInterval); roleInterval = null; }
    }

    const tl = gsap.timeline({
        onComplete: () => {
            stopRoleCycle();
            gsap.set("#loader", { display: "none" });
            gsap.set("#loader-curtain", { display: "none" });
            ScrollTrigger.refresh();
        }
    });

    // Scene 1 — name resolves in, role line starts cycling alongside it
    if (nameUnits.length) {
        tl.to(nameUnits, {
            yPercent: 0, opacity: 1, rotate: 0,
            duration: 0.75, ease: "power4.out", stagger: 0.024
        });
    }
    tl.call(startRoleCycle, null, 0.15);

    // Scene 2 — progress counter, overlapping the tail of the name reveal
    // so nothing sits idle waiting for its turn
    let count = { val: 0 };
    tl.to(count, {
        val: 100,
        duration: 1.7,
        ease: "power2.inOut",
        onUpdate: () => {
            const el = document.getElementById('loader-percent');
            if (el) el.innerText = Math.floor(count.val) + "%";
            const fill = document.getElementById('loader-progress-fill');
            if (fill) fill.style.width = count.val + "%";
        }
    }, nameUnits.length ? "-=0.3" : 0);

    // Scene 3 — a brief "arrival" punch the instant it hits 100%: the
    // percent readout snaps larger and settles, giving the counter an
    // actual moment of completion instead of just stopping.
    tl.to("#loader-percent", { scale: 1.35, duration: 0.16, ease: "power2.out" }, "-=0.05")
      .to("#loader-percent", { scale: 1, duration: 0.3, ease: "back.out(3)" })
      .call(stopRoleCycle)
      // Scene 4 — exit. Curtain and loader wipe up together but the
      // curtain leads by a beat and gets a slight overshoot on its own
      // trailing edge (scaleY) so the wipe reads as one fast, confident
      // gesture instead of two flat panels sliding at the same speed.
      .to('#loader-curtain', { yPercent: -100, duration: 0.75, ease: "expo.inOut" }, "+=0.1")
      .to('#loader', { yPercent: -100, duration: 0.75, ease: "expo.inOut" }, "-=0.65")
      // Scene 5 — hero entry, overlapped into the tail of the wipe so the
      // page feels like it's already in motion the moment the curtain
      // clears rather than starting cold after a pause.
      .to('#navbar', { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.45")
      .to('.hero-reveal', {
          y: 0, autoAlpha: 1, scale: 1, rotate: 0,
          stagger: 0.1, duration: 1.1, ease: "power4.out"
      }, "-=0.4")
      .to('.hero-img-container', {
          autoAlpha: 1, scale: 1, duration: 1.3, ease: "power4.out"
      }, "-=1.05")
      .add(() => {
          gsap.to('#typewriter', { text: "Frontend Engineer | Software Engineer", duration: 2.6, ease: "none" });
      }, "-=0.6");
});
// Backup timeout in case window.load fails (e.g., slow image)
setTimeout(() => {
    if (document.querySelector('.loader-overlay').style.display !== 'none') {
        gsap.set("body", { autoAlpha: 1 });
        gsap.to('#loader', { yPercent: -100, duration: 0.5 });
        gsap.set(".hero-reveal", { y: 0, autoAlpha: 1, scale: 1 });
        gsap.set("#navbar", { autoAlpha: 1, y: 0 });
    }
}, 5000);

// 4. Parallax Elements
gsap.utils.toArray('.parallax-element').forEach(el => {
    const speed = el.getAttribute('data-speed');
    gsap.to(el, {
        y: (i, target) => ScrollTrigger.maxScroll(window) * speed,
        scrollTrigger: {
            trigger: "body",
            start: "top top",
            end: "bottom bottom",
            scrub: 0
        }
    });
});

// 5. Marquee Animation
gsap.to(".marquee-track", {
    xPercent: -50,
    ease: "none",
    duration: 20,
    repeat: -1
});

// 6. Functional Location Map (Leaflet)
// NOTE: coordinates are set to Lagos, Nigeria. Swap LOCATION.lat/lng (and the
// popup copy below) for your own city if you're based elsewhere.
const LOCATION = { lat: 6.5244, lng: 3.3792, label: "Lagos, Nigeria" };
function initLocationMap() {
    const mount = document.getElementById('leaflet-map');
    if (!mount || typeof L === 'undefined') return;

    const map = L.map(mount, {
        center: [LOCATION.lat, LOCATION.lng],
        zoom: 11,
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    const icon = L.divIcon({
        className: '',
        html: '<div style="position:relative;"><div class="map-pin-pulse"></div><div class="map-pin-marker"></div></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });

    L.marker([LOCATION.lat, LOCATION.lng], { icon }).addTo(map)
        .bindPopup(`<strong>${LOCATION.label}</strong><br>Available for remote work worldwide`, { className: 'map-popup', closeButton: false })
        .openPopup();

    // Re-render tiles correctly once the reveal animation finishes sizing the box
    setTimeout(() => map.invalidateSize(), 600);
    window.addEventListener('resize', () => map.invalidateSize());
}
initLocationMap();

// Reveal animation for the map shell (bi-directional, matches the rest of the page)
gsap.from("#map-container", {
    scale: 0.92,
    opacity: 0,
    duration: 0.8,
    ease: "back.out(1.4)",
    scrollTrigger: {
        trigger: "#map-container",
        start: "top 75%",
        end: "bottom top",
        toggleActions: "play reverse play reverse"
    }
});

// 7. General Reveal Animations (Bi-directional)
// Given noticeably more weight than before: more travel distance, a touch
// of scale and blur so elements feel like they're resolving into focus
// rather than just sliding up, and power4 instead of the flatter power2/3.
gsap.utils.toArray('[data-gsap="fade"]').forEach(el => {
    gsap.from(el, {
        scrollTrigger: {
            trigger: el,
            start: "top 90%",
            end: "bottom top",
            toggleActions: "play reverse play reverse"
        },
        opacity: 0, y: 46, scale: 0.97, filter: "blur(6px)",
        duration: 1.1, ease: "power4.out"
    });
});
// Same fade-up, but plays once and never reverses. Used for section
// headings that sit directly after a pinned section: while a section is
// pinned, the page's real scroll position keeps advancing even though the
// pinned content stays visually still, which can fool a "reverse once
// scrolled past" trigger on nearby elements into firing while they're
// still on screen. A one-shot reveal has no such condition to misfire.
gsap.utils.toArray('[data-gsap="fade-once"]').forEach(el => {
    gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        opacity: 0, y: 46, scale: 0.97, filter: "blur(6px)",
        duration: 1.1, ease: "power4.out"
    });
});
// Slide-up now overshoots slightly past its resting position before
// settling (back.out) instead of easing straight in — the difference
// between something arriving with momentum and something just fading up.
gsap.utils.toArray('[data-gsap="slide-up"]').forEach(el => {
    gsap.from(el, {
        scrollTrigger: {
            trigger: el,
            start: "top 85%",
            end: "bottom top",
            toggleActions: "play reverse play reverse"
        },
        y: 140, opacity: 0, rotate: -1.5, duration: 1.15, ease: "back.out(1.5)"
    });
});

// 8. Real Stats — animated count-up instead of an instant text swap. Runs
// once, the moment the numbers scroll into view.
const PROJECTS_DONE = 41;
const YEARS_EXPERIENCE = 5;
function animateStat(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const counter = { val: 0 };
    gsap.to(counter, {
        val: target,
        duration: 1.6,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => { el.innerText = `${Math.floor(counter.val)}+`; },
        onComplete: () => { el.innerText = `${target}+`; }
    });
}
animateStat('dynamic-projects', PROJECTS_DONE);
animateStat('dynamic-exp', YEARS_EXPERIENCE);

// 9. Live Local Time (set this to your own timezone)
const YOUR_TIMEZONE = 'Africa/Lagos';
function updateLocalClock() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: YOUR_TIMEZONE,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short', hour12: false
    }).formatToParts(now);
    const get = (type) => parts.find(p => p.type === type)?.value ?? '00';
    const els = {
        hours: document.getElementById('clock-hours'),
        minutes: document.getElementById('clock-minutes'),
        seconds: document.getElementById('clock-seconds'),
        day: document.getElementById('clock-day'),
        secBar: document.getElementById('sec-bar'),
        timezone: document.getElementById('clock-timezone')
    };
    if (els.hours) els.hours.innerText = get('hour');
    if (els.minutes) els.minutes.innerText = get('minute');
    if (els.seconds) els.seconds.innerText = get('second');
    if (els.day) els.day.innerText = get('weekday').toUpperCase();
    if (els.secBar) els.secBar.style.width = `${(Number(get('second')) / 60) * 100}%`;
    if (els.timezone) els.timezone.innerText = `TIMEZONE: ${YOUR_TIMEZONE.replace('_', ' ').toUpperCase()}`;
}
setInterval(updateLocalClock, 1000);
updateLocalClock();

// 10. Horizontal Scroll Works — pinned scroll-jack on desktop, plain native
// swipeable snap-scroll on mobile. gsap.matchMedia keeps the two from ever
// running at once. Desktop now also carries real velocity-driven life:
// each card's scale/opacity responds to how fast you're scrubbing through
// the reel, so flicking through it fast actually feels different from
// scrolling through it slowly — that felt sense of momentum, applied to
// the one section built entirely around horizontal motion.
const worksWrapper = document.querySelector("#works-wrapper");
const worksProgressFill = document.getElementById('works-progress-fill');
const worksIndexEl = document.getElementById('works-index');
let worksTween = null;
let worksTrigger = null;
const worksMM = gsap.matchMedia();

function visibleWorkItems() {
    return gsap.utils.toArray('.work-item').filter(el => el.dataset.hidden !== "true");
}

function getScrollAmount() {
    const items = visibleWorkItems();
    if (!items.length || !worksWrapper) return 0;
    const last = items[items.length - 1];
    // Include the wrapper's own padding-right — offsetWidth/offsetLeft only
    // reach the last card's edge, not the breathing room after it, so
    // without this the scroll stopped short and the last card sat flush
    // against the viewport edge instead of fully clearing it.
    const paddingRight = parseFloat(getComputedStyle(worksWrapper).paddingRight) || 0;
    const totalWidth = (last.offsetLeft + last.offsetWidth + paddingRight) - worksWrapper.offsetLeft;
    return -Math.max(0, totalWidth - window.innerWidth);
}

function updateWorksReadout(progress) {
    const total = visibleWorkItems().length;
    if (worksProgressFill) worksProgressFill.style.width = `${progress * 100}%`;
    if (worksIndexEl && total) {
        const current = Math.min(total, Math.floor(progress * total) + 1);
        worksIndexEl.innerText = `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    }
}

// Nudges each visible card's scale/opacity based on scrub velocity — cards
// punch slightly larger and brighter when you're flicking through fast,
// and settle back to their resting state as the scroll speed drops.
function applyWorksMomentum(velocity) {
    const items = visibleWorkItems();
    if (!items.length) return;
    const kick = gsap.utils.clamp(0, 1, Math.abs(velocity) / 3500);
    items.forEach(item => {
        const inner = item.querySelector('.work-card-light, .work-card-dark');
        if (!inner) return;
        gsap.to(inner, {
            scale: 1 - kick * 0.03,
            duration: 0.25,
            overwrite: 'auto',
            ease: "power2.out"
        });
    });
}

if (worksWrapper) {
    // Desktop / trackpad — pinned, scrubbed horizontal reel
    worksMM.add("(min-width: 900px)", () => {
        gsap.set(worksWrapper, { x: 0 });
        const total = visibleWorkItems().length;
        if (worksIndexEl) worksIndexEl.innerText = total ? `01 / ${String(total).padStart(2, '0')}` : "00 / 00";
        if (worksProgressFill) worksProgressFill.style.width = "0%";
        if (!total) return;

        worksTween = gsap.to(worksWrapper, { x: getScrollAmount, ease: "none" });
        worksTrigger = ScrollTrigger.create({
            trigger: "#works-container",
            start: "top top",
            end: () => "+=" + Math.max(1, -getScrollAmount()),
            pin: true,
            animation: worksTween,
            scrub: 1.1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
            onUpdate: (self) => {
                updateWorksReadout(self.progress);
                applyWorksMomentum(self.getVelocity());
            }
        });

        // matchMedia calls this automatically when leaving the breakpoint
        return () => {
            if (worksTrigger) worksTrigger.kill();
            if (worksTween) worksTween.kill();
            gsap.set(worksWrapper, { clearProps: "transform" });
            gsap.set('.work-card-light, .work-card-dark', { clearProps: "scale" });
        };
    });

    // Mobile / touch — no pinning at all; CSS handles the native scroll-snap
    // row. We just keep the progress bar and index readout synced to it.
    worksMM.add("(max-width: 899px)", () => {
        const total = visibleWorkItems().length;
        if (worksIndexEl) worksIndexEl.innerText = total ? `01 / ${String(total).padStart(2, '0')}` : "00 / 00";

        const onScroll = () => {
            const max = worksWrapper.scrollWidth - worksWrapper.clientWidth;
            updateWorksReadout(max > 0 ? worksWrapper.scrollLeft / max : 0);
        };
        worksWrapper.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        return () => {
            worksWrapper.removeEventListener('scroll', onScroll);
        };
    });
}

// Soft tilt-on-hover for work cards (desktop only, mirrors the magnetic button feel)
if (window.matchMedia('(hover: hover)').matches) {
    gsap.utils.toArray('.work-item').forEach(item => {
        const inner = item.querySelector('.work-card-light, .work-card-dark');
        if (!inner) return;
        item.addEventListener('mousemove', (e) => {
            const rect = item.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width - 0.5;
            const py = (e.clientY - rect.top) / rect.height - 0.5;
            gsap.to(inner, { rotateX: py * -8, rotateY: px * 8, scale: 1.02, duration: 0.4, ease: "power2.out", transformPerspective: 800 });
        });
        item.addEventListener('mouseleave', () => {
            gsap.to(inner, { rotateX: 0, rotateY: 0, scale: 1, duration: 0.6, ease: "power3.out" });
        });
    });
}

// 11. Timeline Line Drawing
gsap.to("#scroll-line", {
    height: "100%",
    ease: "none",
    scrollTrigger: {
        trigger: ".timeline-line",
        start: "top center",
        end: "bottom center",
        scrub: 0.5
    }
});
// Force refresh triggers after window load to ensure accurate measurements
window.addEventListener("load", () => {
    ScrollTrigger.refresh();
});
// Service Items — layered entrance instead of one flat fade: the card
// slides+rotates in first, the timeline dot pops with an elastic bounce
// once it lands, then the skill list staggers in line by line.
gsap.utils.toArray('[data-gsap="service-item"]').forEach((item) => {
    const card = item.querySelector('.service-card');
    const dot = item.querySelector('.service-dot');
    const listItems = item.querySelectorAll('.service-list li');

    if (card) gsap.set(card, { opacity: 0, x: -70, rotate: -4 });
    if (dot) gsap.set(dot, { scale: 0 });
    if (listItems.length) gsap.set(listItems, { opacity: 0, x: 24 });

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: item,
            start: "top 82%",
            end: "bottom top",
            toggleActions: "play reverse play reverse"
        }
    });
    if (card) tl.to(card, { opacity: 1, x: 0, rotate: 0, duration: 0.75, ease: "power4.out" });
    if (dot) tl.to(dot, { scale: 1, duration: 0.5, ease: "back.out(3)" }, card ? "-=0.3" : 0);
    if (listItems.length) tl.to(listItems, { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: "power2.out" }, "-=0.25");
});

// 12. Scroll-Triggered "Decode" Headings — every [data-scramble] element
// (the markup already had this attribute on several headings with nothing
// wired up behind it) runs through randomized characters once, the first
// time it enters the viewport, then locks into the real text.
function initScrambleHeadings() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%+=-";
    gsap.utils.toArray('[data-scramble]').forEach((el) => {
        const original = el.textContent;
        const len = original.length;
        ScrollTrigger.create({
            trigger: el,
            start: "top 85%",
            once: true,
            onEnter: () => {
                const driver = { p: 0 };
                gsap.to(driver, {
                    p: 1,
                    duration: 0.7,
                    ease: "none",
                    onUpdate: () => {
                        const revealCount = Math.floor(driver.p * len);
                        let out = "";
                        for (let i = 0; i < len; i++) {
                            const ch = original[i];
                            out += (ch === " " || i < revealCount) ? ch : CHARS[(Math.random() * CHARS.length) | 0];
                        }
                        el.textContent = out;
                    },
                    onComplete: () => { el.textContent = original; }
                });
            }
        });
    });
}
initScrambleHeadings();

// 13. Testimonials — cards "deal in" with a snappy rotate+scale pop
// instead of a plain fade, the quote mark gets its own delayed flourish,
// and a soft hover tilt (matching the work cards) makes them feel alive
// rather than static once they've landed.
const testimonialCards = gsap.utils.toArray('.testimonial-card');
if (testimonialCards.length) {
    const quoteMarks = testimonialCards
        .map(card => card.querySelector('.ri-double-quotes-l'))
        .filter(Boolean);
    gsap.set(quoteMarks, { scale: 0, rotate: -25 });

    const tCardsTl = gsap.timeline({
        scrollTrigger: {
            trigger: '#testimonials',
            start: "top 78%",
            end: "bottom top",
            toggleActions: "play reverse play reverse"
        }
    });
    tCardsTl.from(testimonialCards, {
        y: 80,
        opacity: 0,
        scale: 0.85,
        rotate: (i) => (i % 2 === 0 ? -4 : 4),
        duration: 0.8,
        ease: "back.out(1.6)",
        stagger: 0.15
    });
    tCardsTl.to(quoteMarks, {
        scale: 1,
        rotate: 0,
        duration: 0.5,
        ease: "back.out(4)",
        stagger: 0.12
    }, "-=0.4");

    if (window.matchMedia('(hover: hover)').matches) {
        testimonialCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const px = (e.clientX - rect.left) / rect.width - 0.5;
                const py = (e.clientY - rect.top) / rect.height - 0.5;
                gsap.to(card, { rotateX: py * -6, rotateY: px * 6, duration: 0.4, ease: "power2.out", transformPerspective: 800 });
            });
            card.addEventListener('mouseleave', () => {
                gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power3.out" });
            });
        });
    }
}

// 14–16. "Why I Build" — pinned exactly like the Works carousel above
// (same gsap.matchMedia split, same reasoning), except what plays out
// while the section is locked in place is a content reveal instead of a
// horizontal drag: the manifesto's words resolve, then each reason lights
// up, then the signal network behind them locks into its resolved shape —
// all driven 1:1 by one scroll distance, reversible if you scroll back up.
// Desktop / precise-pointer only: pinning a tall block for a fixed scroll
// distance is exactly the kind of thing that fights a thumb on a
// touchscreen (the same call already made for the Works carousel), so
// touch and narrow screens get the plain, non-pinned in-flow reveal.

// The node network behind the text. Nodes seed scattered ("idea") and
// resolve into an ordered grid ("something real") as `progress` moves
// from 0 to 1. By default it tracks its own scroll range (manageOwnScroll);
// initWhySection() disables that on desktop and feeds it progress directly
// every frame instead, so it resolves in lockstep with the pinned timeline
// rather than running on its own separate schedule.
function initWhySignal({ manageOwnScroll = true } = {}) {
    const canvas = document.getElementById('why-signal');
    const section = canvas ? canvas.closest('section') : null;
    if (!canvas || !section) return null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const COLS = 7;
    const NODE_COUNT = isCoarse ? 28 : 42;
    const LINK_DIST = isCoarse ? 110 : 150;

    let width = 0, height = 0, nodes = [];
    let progress = 0; // 0 = scattered "idea" -> 1 = resolved "something real"
    let pulse = 0;    // brief surge from a fast flick or a finished reason line
    let packets = []; // bright dots that race along a connection when a pulse fires
    const pointer = { x: -9999, y: -9999 };
    let rafId = null;

    function seed() {
        const rows = Math.ceil(NODE_COUNT / COLS);
        nodes = [];
        for (let i = 0; i < NODE_COUNT; i++) {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            nodes.push({
                sx: Math.random() * width, sy: Math.random() * height,
                tx: (col + 0.5) * (width / COLS), ty: (row + 0.5) * (height / rows),
                x: 0, y: 0, drift: Math.random() * Math.PI * 2
            });
        }
    }

    function resize() {
        const rect = section.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
    }

    function onPointerMove(e) {
        const rect = section.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
    }
    function onPointerLeave() {
        pointer.x = -9999;
        pointer.y = -9999;
    }

    function tick() {
        ctx.clearRect(0, 0, width, height);
        pulse *= 0.92;
        const eased = gsap.parseEase("power2.inOut")(progress);

        nodes.forEach(n => {
            n.drift += 0.01;
            const wobble = (1 - eased) * 14; // settles as it resolves
            let x = gsap.utils.interpolate(n.sx, n.tx, eased) + Math.sin(n.drift) * wobble;
            let y = gsap.utils.interpolate(n.sy, n.ty, eased) + Math.cos(n.drift * 1.3) * wobble;

            const dx = x - pointer.x, dy = y - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 120) {
                const pull = (1 - dist / 120) * 18;
                x -= (dx / (dist || 1)) * pull;
                y -= (dy / (dist || 1)) * pull;
            }
            n.x = x; n.y = y;
        });

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < LINK_DIST) {
                    const alpha = (1 - d / LINK_DIST) * (0.08 + eased * 0.22 + pulse * 0.3);
                    ctx.strokeStyle = `rgba(47, 216, 201, ${alpha})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
        nodes.forEach(n => {
            const r = 1.4 + eased * 1.6;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(47, 216, 201, ${0.25 + eased * 0.55 + pulse * 0.4})`;
            ctx.fill();
        });

        // Packets: bright sparks racing node-to-node when a pulse fires,
        // brightest mid-flight, fading in and out at either end.
        packets = packets.filter(p => p.t < 1);
        packets.forEach(p => {
            p.t += p.speed;
            const x = gsap.utils.interpolate(p.a.x, p.b.x, p.t);
            const y = gsap.utils.interpolate(p.a.y, p.b.y, p.t);
            const fade = Math.max(0, 1 - Math.abs(p.t - 0.5) * 1.6);
            ctx.beginPath();
            ctx.arc(x, y, 2.2, 0, Math.PI * 2);
            if (!isCoarse) { ctx.shadowBlur = 8; ctx.shadowColor = "rgba(47,216,201,0.9)"; }
            ctx.fillStyle = `rgba(255,255,255,${fade * 0.9})`;
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        rafId = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener('resize', resize);
    section.addEventListener('mousemove', onPointerMove);
    section.addEventListener('mouseleave', onPointerLeave);

    function spawnPackets(amt) {
        pulse = Math.min(1, pulse + (amt || 0.6));
        if (nodes.length > 1) {
            const spawnCount = isCoarse ? 2 : 4;
            for (let k = 0; k < spawnCount; k++) {
                const a = nodes[(Math.random() * nodes.length) | 0];
                const b = nodes[(Math.random() * nodes.length) | 0];
                if (a === b) continue;
                packets.push({ a, b, t: 0, speed: 0.02 + Math.random() * 0.02 });
            }
        }
    }
    window.whySignalPulse = spawnPackets;

    if (manageOwnScroll) {
        ScrollTrigger.create({
            trigger: section,
            start: "top 80%",
            end: "bottom 30%",
            scrub: 1,
            onUpdate: (self) => {
                progress = self.progress;
                pulse = Math.min(1, pulse + Math.abs(self.getVelocity()) / 3000);
            }
        });
    }

    // Only animate while the section is actually in view, same discipline
    // as the hero's cursor-reactive grid.
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                if (!rafId) tick();
            } else if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                ctx.clearRect(0, 0, width, height);
            }
        });
    }, { threshold: 0.05 });
    observer.observe(section);

    return {
        setProgress: (p) => { progress = p; },
        bumpPulse: spawnPackets
    };
}

// Splits a manifesto paragraph into per-word units, preferring real
// SplitText (auto word-masking) over the vanilla span-splitter above.
function splitManifesto(el) {
    if (HAS_SPLIT_TEXT) {
        const split = SplitText.create(el, { type: "words", wordsClass: "word" });
        return { words: split.words, revert: () => split.revert() };
    }
    return splitIntoWordSpans(el);
}

function initWhySection() {
    const section = document.getElementById('why');
    const manifestoEl = document.querySelector('[data-read-along]');
    const reasonItems = gsap.utils.toArray('.why-reason');
    const introEl = document.getElementById('why-intro');
    if (!section || !manifestoEl) return;

    // The heading/badge gets a plain one-time reveal, deliberately kept
    // separate from the pinned master timeline below: it needs to be
    // visible before the pin engages and simply stay that way, with no
    // "reverse if scrolled past" condition that pinning could confuse.
    if (introEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.from(introEl, {
            scrollTrigger: { trigger: introEl, start: "top 90%", once: true },
            opacity: 0, y: 20, duration: 0.8
        });
    }

    // The signal canvas always runs; only who *drives* its progress changes
    // below (its own scroll range on mobile, the pinned master on desktop).
    const signal = initWhySignal({ manageOwnScroll: true });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const mm = gsap.matchMedia();

    // Desktop / mouse — same mechanic as the Works carousel, applied to
    // the reasons: the section pins and does not release until the whole
    // internal sequence — manifesto, then every reason sliding through —
    // has actually finished. The reasons' own parent is treated as the
    // horizontal track and pinned exactly like #works-container is.
    mm.add("(min-width: 900px) and (hover: hover)", () => {
        const split = splitManifesto(manifestoEl);
        gsap.set(split.words, { opacity: 0.15, y: 32, scale: 0.94, filter: "blur(10px)", color: "#a79f8e" });
        gsap.utils.toArray('.why-reason-fill').forEach(f => gsap.set(f, { width: "0%" }));

        // Only treat the reasons' shared parent as a carousel track if
        // every one of its children is actually a reason — if it turns out
        // to also hold something else (a heading, the manifesto), mutating
        // its layout would break that too, so this bails out safely to the
        // plain in-place reveal below instead of guessing.
        const candidateTrack = reasonItems.length ? reasonItems[0].parentElement : null;
        const track = (candidateTrack && reasonItems.length > 1
            && Array.from(candidateTrack.children).every(child => child.classList.contains('why-reason'))
        ) ? candidateTrack : null;

        let restoreTrack = () => {};
        if (track) {
            // Layout is applied as inline styles (not new CSS classes) so
            // it doesn't fight whatever classes the reasons already carry
            // in the markup, and everything this touches is put back
            // exactly as found in the cleanup function below.
            const prevTrackStyle = track.getAttribute('style') || '';
            const prevItemStyles = reasonItems.map(item => item.getAttribute('style') || '');
            Object.assign(track.style, {
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 'clamp(1.5rem, 3vw, 3rem)',
                willChange: 'transform'
            });
            reasonItems.forEach(item => { item.style.flex = '0 0 min(620px, 82vw)'; });
            restoreTrack = () => {
                track.setAttribute('style', prevTrackStyle);
                reasonItems.forEach((item, i) => item.setAttribute('style', prevItemStyles[i]));
            };
        }

        // The fixed nav sits at the very top of the viewport, so pinning
        // flush against "top top" makes the section's own content render
        // underneath/through it. Clearing it by its real measured height
        // (not a guessed pixel value) keeps the pinned content visually
        // below the nav for the entire pinned duration.
        const navClearance = () => (document.getElementById('navbar')?.offsetHeight || 0) + 16;
        // How far the track has to travel to bring the last reason fully
        // into view — measured from the real rendered content, the same
        // approach the Works carousel uses, not a guessed distance.
        const getReasonsTravel = () => {
            if (!track) return 0;
            const last = reasonItems[reasonItems.length - 1];
            const totalWidth = (last.offsetLeft + last.offsetWidth) - track.offsetLeft;
            return -Math.max(0, totalWidth - window.innerWidth * 0.86);
        };

        // end reads the timeline's OWN total duration. Every scene below is
        // added synchronously before ScrollTrigger ever needs this number
        // (its first refresh, once this whole function has returned), so
        // the pinned scroll distance always matches exactly what's inside
        // it — the section can't release early, and there's no dead scroll
        // once the last reason has passed.
        const master = gsap.timeline({
            scrollTrigger: {
                trigger: section,
                start: () => "top " + navClearance() + "px",
                end: () => "+=" + Math.max(1, Math.round(master.duration() * 260)),
                pin: true,
                scrub: 0.6,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                onUpdate: (self) => {
                    if (signal) signal.setProgress(self.progress);
                    if (track) {
                        // Same velocity-reactive kick used on the Works
                        // cards — flicking through fast reads differently
                        // than scrolling through slowly.
                        const kick = gsap.utils.clamp(0, 1, Math.abs(self.getVelocity()) / 3500);
                        gsap.to(reasonItems, { scale: 1 - kick * 0.025, duration: 0.25, overwrite: 'auto', ease: "power2.out" });
                    }
                }
            }
        });

        // Scene 1: the manifesto resolves. Labels mark each scene explicitly
        // (GSAP's own recommendation for multi-stage pinned timelines)
        // rather than hand-computed time fractions, which didn't line up
        // with how long the staggered reveal actually takes.
        master.addLabel("manifesto")
            .to(split.words, {
                opacity: 1, y: 0, scale: 1, filter: "blur(0px)", color: "#f6f1e7",
                stagger: 0.03, ease: "none"
            }, "manifesto")
            .addLabel("carousel"); // marks exactly when the manifesto tween ends

        if (track) {
            // Scene 2: the reasons carousel — one tween drives the whole
            // slide, exactly like the Works track's single x tween. This
            // section stays pinned for its entire duration; each reason's
            // trace lights up as its turn comes, roughly as it crosses
            // into view, the same "landing" feedback the old version had.
            const perReason = 1.3;
            master.to(track, {
                x: getReasonsTravel,
                ease: "none",
                duration: reasonItems.length * perReason
            }, "carousel");
            reasonItems.forEach((item, i) => {
                const fill = item.querySelector('.why-reason-fill');
                const at = "carousel+=" + (i * perReason + perReason * 0.2);
                if (fill) master.to(fill, { width: "100%", ease: "none", duration: perReason * 0.55 }, at);
                master.call(() => { if (signal) signal.bumpPulse(0.55); }, null, at);
            });
        } else {
            // Fallback — couldn't confirm the reasons have a dedicated
            // shared parent, so this keeps the previous, safe behavior:
            // each reason lands and its trace lights up in place, one
            // after another, instead of sliding through as cards.
            gsap.set(reasonItems, { opacity: 0, y: 22 });
            reasonItems.forEach((item) => {
                const fill = item.querySelector('.why-reason-fill');
                master.to(item, { opacity: 1, y: 0, ease: "none", duration: 0.35 });
                if (fill) master.to(fill, { width: "100%", ease: "none", duration: 0.25 }, "<");
                master.call(() => { if (signal) signal.bumpPulse(0.6); }, null, "<");
            });
        }

        // We returned a custom cleanup, so matchMedia won't auto-revert —
        // take that on ourselves: kill the pin/timeline, restore the text,
        // and put every inline style this added back exactly as found.
        return () => {
            if (master.scrollTrigger) master.scrollTrigger.kill();
            master.kill();
            split.revert();
            restoreTrack();
            gsap.set(reasonItems, { clearProps: "all" });
            if (track) gsap.set(track, { clearProps: "transform" });
        };
    });

    // Touch / narrow screens — nothing pins; the manifesto still resolves
    // and reasons still type themselves, but as a normal, un-jacked scroll.
    mm.add("(max-width: 899px), (hover: none)", () => {
        const split = splitManifesto(manifestoEl);
        gsap.set(split.words, { opacity: 0.18, y: 16, filter: "blur(4px)", color: "#a79f8e" });
        const wordsTween = gsap.to(split.words, {
            opacity: 1, y: 0, filter: "blur(0px)", color: "#f6f1e7",
            stagger: 0.045, ease: "power2.out",
            scrollTrigger: { trigger: manifestoEl, start: "top 88%", end: "bottom 25%", scrub: 0.5 }
        });

        const reasonTriggers = reasonItems.map((item) => {
            const line = item.querySelector('.why-reason-text');
            const fill = item.querySelector('.why-reason-fill');
            if (!line) return null;
            const full = line.textContent;
            line.setAttribute('aria-label', full);
            return ScrollTrigger.create({
                trigger: item,
                start: "top 88%",
                once: true,
                onEnter: () => {
                    line.textContent = '';
                    gsap.to(line, {
                        text: full,
                        duration: Math.max(0.6, full.length * 0.025),
                        ease: "none",
                        onComplete: () => {
                            if (fill) gsap.to(fill, { width: "100%", duration: 0.5, ease: "power2.out" });
                            if (signal) signal.bumpPulse(0.7);
                        }
                    });
                }
            });
        }).filter(Boolean);

        return () => {
            if (wordsTween.scrollTrigger) wordsTween.scrollTrigger.kill();
            wordsTween.kill();
            split.revert();
            reasonTriggers.forEach(t => t.kill());
        };
    });
}
initWhySection();

// 17. Interactive Hero Grid — a cursor-reactive dot field behind the hero
// copy. Dots get pushed away from the pointer and spring back on their own.
// Skipped entirely for prefers-reduced-motion; density drops on touch
// devices where there's no hover to react to anyway.
function initHeroGrid() {
    const canvas = document.getElementById('hero-grid');
    const heroSection = canvas ? canvas.closest('section') : null;
    if (!canvas || !heroSection) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const spacing = isCoarse ? 48 : 34;
    const radius = isCoarse ? 70 : 140;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0, height = 0, dots = [];
    const pointer = { x: -9999, y: -9999 };
    let rafId = null;

    function resize() {
        const rect = heroSection.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        dots = [];
        for (let y = spacing / 2; y < height; y += spacing) {
            for (let x = spacing / 2; x < width; x += spacing) {
                dots.push({ x, y, ox: x, oy: y, vx: 0, vy: 0 });
            }
        }
    }

    function onPointerMove(e) {
        const rect = heroSection.getBoundingClientRect();
        pointer.x = e.clientX - rect.left;
        pointer.y = e.clientY - rect.top;
    }
    function onPointerLeave() {
        pointer.x = -9999;
        pointer.y = -9999;
    }

    function tick() {
        ctx.clearRect(0, 0, width, height);
        for (const d of dots) {
            const dx = d.x - pointer.x;
            const dy = d.y - pointer.y;
            const dist = Math.hypot(dx, dy);
            let targetX = d.ox;
            let targetY = d.oy;
            if (dist < radius) {
                const force = 1 - dist / radius;
                const safeDist = dist || 1;
                targetX = d.ox + (dx / safeDist) * force * 24;
                targetY = d.oy + (dy / safeDist) * force * 24;
            }
            d.vx += (targetX - d.x) * 0.12;
            d.vy += (targetY - d.y) * 0.12;
            d.vx *= 0.82;
            d.vy *= 0.82;
            d.x += d.vx;
            d.y += d.vy;

            const displaced = Math.hypot(d.x - d.ox, d.y - d.oy);
            ctx.beginPath();
            ctx.arc(d.x, d.y, 1.3 + Math.min(1.4, displaced * 0.05), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(13, 110, 104, ${0.3 + Math.min(0.4, displaced * 0.012)})`;
            ctx.fill();
        }
        rafId = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener('resize', resize);
    heroSection.addEventListener('mousemove', onPointerMove);
    heroSection.addEventListener('mouseleave', onPointerLeave);

    // Only animate while the hero is actually in view — no wasted cycles
    // once the visitor has scrolled past it.
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                if (!rafId) tick();
            } else if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                ctx.clearRect(0, 0, width, height);
            }
        });
    }, { threshold: 0.05 });
    observer.observe(heroSection);
}
initHeroGrid();

// 18. Footer — the page's last beat, so it gets its own arrival: the block
// rises and clears as a whole first, then the social icons drop in with a
// staggered elastic pop (mirroring the same "landing" language used for
// the service-item timeline dots earlier), so the page's very last motion
// still feels connected to everything that came before it. Selectors are
// kept generic/defensive (tag + the one class we know exists) so this
// works with the footer markup already in index.html without needing any
// new hooks there.
function initFooterReveal() {
    const footerEl = document.querySelector('footer');
    if (!footerEl) return;
    const icons = gsap.utils.toArray('.social-icon');
    const headings = footerEl.querySelectorAll('h2, h3');
    const paragraphs = footerEl.querySelectorAll('p');
    const links = Array.from(footerEl.querySelectorAll('a')).filter(a => !a.classList.contains('social-icon'));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(footerEl, { autoAlpha: 0 });
    if (icons.length) gsap.set(icons, { scale: 0, rotate: -20, opacity: 0 });
    if (headings.length) gsap.set(headings, { y: 30, opacity: 0 });
    if (paragraphs.length) gsap.set(paragraphs, { y: 20, opacity: 0 });
    if (links.length) gsap.set(links, { y: 16, opacity: 0 });

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: footerEl,
            start: "top 85%",
            end: "bottom bottom",
            toggleActions: "play reverse play reverse"
        }
    });
    tl.to(footerEl, { autoAlpha: 1, duration: 0.4, ease: "none" });
    if (headings.length) tl.to(headings, { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, ease: "power4.out" }, "-=0.2");
    if (paragraphs.length) tl.to(paragraphs, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: "power3.out" }, "-=0.5");
    if (links.length) tl.to(links, { y: 0, opacity: 1, duration: 0.6, stagger: 0.04, ease: "power3.out" }, "-=0.5");
    if (icons.length) tl.to(icons, { scale: 1, rotate: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: "back.out(2.5)" }, "-=0.35");
}
initFooterReveal();