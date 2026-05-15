// ==UserScript==
// @name         K8s Dashboard Tabby Opener
// @namespace    https://github.com/Eugeny/tabby
// @version      0.1.0
// @description  在 Kubernetes Dashboard 的 Pod 页面注入按钮，使用 ws-term 的 k8s-dashboard 协议唤起 Tabby
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        buttonText: 'Open in Tabby',
        tabbyShell: 'command -v bash >/dev/null 2>&1 && exec bash',
        dashboardShell: '',
        allowInsecure: true,
        includeContainer: true,
        syncIntervalMs: 1000,
    };

    const BUTTON_ID = 'ws-term-k8s-dashboard-tabby-opener';
    const NAME_RULES = {
        namespace: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
        pod: /^[a-z0-9]([-.a-z0-9]*[a-z0-9])?$/,
        container: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
    };

    function getCookie(name) {
        const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function normalizeText(value) {
        return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    }

    function isValidResourceName(kind, value) {
        const rule = NAME_RULES[kind];
        return Boolean(rule && value && rule.test(value));
    }

    function extractResourceName(kind, rawValue) {
        const normalized = normalizeText(rawValue);
        if (!normalized) {
            return '';
        }

        if (isValidResourceName(kind, normalized)) {
            return normalized;
        }

        const parts = normalized
            .replace(/[^a-zA-Z0-9._\-/ ]+/g, ' ')
            .split(/[\s/]+/)
            .map((part) => part.replace(/^[^a-z0-9]+|[^a-z0-9.-]+$/gi, '').toLowerCase())
            .filter(Boolean);

        for (const part of parts) {
            if (isValidResourceName(kind, part)) {
                return part;
            }
        }

        return '';
    }

    function getElementCandidateValue(element) {
        if (!element) {
            return '';
        }

        const directValue = normalizeText(
            element.getAttribute('data-value')
            || element.getAttribute('value')
            || element.getAttribute('aria-label')
            || element.value
        );

        return directValue || normalizeText(element.textContent);
    }

    function wsOriginFromLocation() {
        const url = new URL(window.location.origin);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url.origin;
    }

    function pickFirstValue(searchParams, keys) {
        for (const key of keys) {
            const value = searchParams.get(key);
            if (value) {
                return value.trim();
            }
        }
        return '';
    }

    function parsePathForPodInfo(pathname) {
        const normalizedPath = pathname
            .replace(/^#!/, '')
            .replace(/^#/, '')
            .split('?')[0]
            .trim();

        if (!normalizedPath) {
            return {};
        }

        const segments = normalizedPath
            .split('/')
            .filter(Boolean)
            .map((segment) => decodeURIComponent(segment));

        const podInfo = {};

        for (let index = 0; index < segments.length; index += 1) {
            const current = segments[index].toLowerCase();

            if ((current === 'pod' || current === 'pods') && segments[index + 1]) {
                if (segments[index + 2]) {
                    podInfo.namespace = podInfo.namespace || extractResourceName('namespace', segments[index + 1]);
                    podInfo.pod = podInfo.pod || extractResourceName('pod', segments[index + 2]);
                } else {
                    podInfo.pod = podInfo.pod || extractResourceName('pod', segments[index + 1]);
                }
            }

            if ((current === 'container' || current === 'containers') && segments[index + 1]) {
                podInfo.container = podInfo.container || extractResourceName('container', segments[index + 1]);
            }
        }

        return podInfo;
    }

    function parseUrlLike(urlLike) {
        const result = {};

        try {
            const url = new URL(urlLike, window.location.origin);
            result.namespace = extractResourceName('namespace', pickFirstValue(url.searchParams, ['namespace', 'ns', 'var-namespace']));
            result.pod = extractResourceName('pod', pickFirstValue(url.searchParams, ['pod', 'podName', 'name', 'var-pod']));
            result.container = extractResourceName('container', pickFirstValue(url.searchParams, ['container', 'var-container']));

            return Object.assign(result, parsePathForPodInfo(url.pathname));
        } catch {
            return parsePathForPodInfo(urlLike);
        }
    }

    function mergePodInfo(base, patch) {
        if (!patch) {
            return base;
        }

        if (!base.namespace && patch.namespace) {
            base.namespace = patch.namespace;
        }
        if (!base.pod && patch.pod) {
            base.pod = patch.pod;
        }
        if (!base.container && patch.container) {
            base.container = patch.container;
        }

        return base;
    }

    function extractLabelValue(labelPattern) {
        const candidates = Array.from(document.querySelectorAll('td, th, dt, dd, div, span, label, p, a'));

        for (const node of candidates) {
            const text = normalizeText(node.textContent || '');
            if (!text || !labelPattern.test(text)) {
                continue;
            }

            const sibling = node.nextElementSibling;
            if (sibling) {
                const siblingText = normalizeText(sibling.textContent || '');
                if (siblingText) {
                    return siblingText;
                }
            }

            const parent = node.parentElement;
            if (parent && parent.children.length >= 2) {
                for (const child of parent.children) {
                    if (child === node) {
                        continue;
                    }

                    const childText = normalizeText(child.textContent || '');
                    if (childText && childText !== text) {
                        return childText;
                    }
                }
            }
        }

        return '';
    }

    function getSelectedContainer() {
        const selectedOption = document.querySelector('select option:checked');
        const optionValue = getElementCandidateValue(selectedOption);
        if (optionValue) {
            return optionValue;
        }

        const selectedListboxOption = document.querySelector('[role="option"][aria-selected="true"]');
        const listboxValue = getElementCandidateValue(selectedListboxOption);
        if (listboxValue) {
            return listboxValue;
        }

        return '';
    }

    function currentHeadingText() {
        const heading = document.querySelector('h1, h2, [role="heading"]');
        return heading && heading.textContent ? normalizeText(heading.textContent) : '';
    }

    function pickFirstNonEmpty(values) {
        for (const value of values) {
            if (value) {
                return value;
            }
        }
        return '';
    }

    function resolvePodInfo() {
        const podInfo = {};

        mergePodInfo(podInfo, parseUrlLike(window.location.href));

        if (window.location.hash) {
            mergePodInfo(podInfo, parseUrlLike(window.location.hash.slice(1)));
        }

        if (!podInfo.namespace) {
            podInfo.namespace = extractResourceName('namespace', extractLabelValue(/^(namespace|命名空间)$/i));
        }

        if (!podInfo.pod) {
            podInfo.pod = pickFirstNonEmpty([
                extractResourceName('pod', extractLabelValue(/^(pod|pod name|实例名)$/i)),
                extractResourceName('pod', currentHeadingText()),
            ]);
        }

        if (!podInfo.container) {
            podInfo.container = pickFirstNonEmpty([
                extractResourceName('container', getSelectedContainer()),
                extractResourceName('container', extractLabelValue(/^(container|容器)$/i)),
            ]);
        }

        if (podInfo.pod) {
            podInfo.pod = extractResourceName('pod', podInfo.pod.replace(/^Pod\s+/i, '').trim());
        }

        return podInfo;
    }

    function getAuthContext() {
        return {
            authMode: getCookie('authMode') || 'token',
            username: getCookie('username'),
            jweToken: getCookie('jweToken'),
        };
    }

    function buildWsTermUrl() {
        const podInfo = resolvePodInfo();
        const auth = getAuthContext();

        if (!podInfo.namespace || !podInfo.pod || !auth.jweToken) {
            return null;
        }

        const wsUrl = new URL(wsOriginFromLocation());
        wsUrl.searchParams.set('namespace', podInfo.namespace);
        wsUrl.searchParams.set('pod', podInfo.pod);
        wsUrl.searchParams.set('authMode', auth.authMode);
        wsUrl.searchParams.set('jweToken', auth.jweToken);
        wsUrl.searchParams.set('ws-term.option.protocol', 'k8s-dashboard');

        if (CONFIG.includeContainer && podInfo.container) {
            wsUrl.searchParams.set('container', podInfo.container);
        }
        if (auth.username) {
            wsUrl.searchParams.set('username', auth.username);
        }
        if (CONFIG.dashboardShell) {
            wsUrl.searchParams.set('shell', CONFIG.dashboardShell);
        }
        if (CONFIG.tabbyShell) {
            wsUrl.searchParams.set('ws-term.option.shell', CONFIG.tabbyShell);
        }
        if (CONFIG.allowInsecure) {
            wsUrl.searchParams.set('ws-term.option.allowInsecure', 'true');
        }

        return wsUrl.toString();
    }

    function buildTabbyUrl() {
        const wsTermUrl = buildWsTermUrl();
        if (!wsTermUrl) {
            return null;
        }

        return `tabby://quickConnect?providerId=ws-term&query=${encodeURIComponent(wsTermUrl)}`;
    }

    function missingFields() {
        const podInfo = resolvePodInfo();
        const auth = getAuthContext();
        const missing = [];

        if (!podInfo.namespace) {
            missing.push('namespace');
        }
        if (!podInfo.pod) {
            missing.push('pod');
        }
        if (!auth.jweToken) {
            missing.push('jweToken cookie');
        }

        return missing;
    }

    function shouldShowButton() {
        const markerText = `${window.location.pathname} ${window.location.hash}`.toLowerCase();
        const podInfo = resolvePodInfo();

        return markerText.includes('pod') || Boolean(podInfo.namespace && podInfo.pod);
    }

    function ensureButton() {
        let button = document.getElementById(BUTTON_ID);
        if (!button) {
            button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.textContent = CONFIG.buttonText;
            button.style.position = 'fixed';
            button.style.right = '24px';
            button.style.bottom = '24px';
            button.style.zIndex = '2147483647';
            button.style.padding = '10px 14px';
            button.style.border = 'none';
            button.style.borderRadius = '8px';
            button.style.background = '#111827';
            button.style.color = '#ffffff';
            button.style.fontSize = '14px';
            button.style.fontWeight = '600';
            button.style.cursor = 'pointer';
            button.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.18)';

            button.addEventListener('click', () => {
                const tabbyUrl = buildTabbyUrl();
                if (!tabbyUrl) {
                    console.warn('[ws-term] missing fields for Tabby opener:', missingFields());
                    return;
                }

                console.log('[ws-term] opening Tabby:', decodeURIComponent(tabbyUrl));
                window.location.href = tabbyUrl;
            });

            document.body.appendChild(button);
        }

        const showButton = shouldShowButton();
        button.style.display = showButton ? 'block' : 'none';

        if (!showButton) {
            return;
        }

        const tabbyUrl = buildTabbyUrl();
        const disabled = !tabbyUrl;

        button.disabled = disabled;
        button.style.opacity = disabled ? '0.55' : '1';
        button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        button.title = disabled
            ? `无法唤起 Tabby，缺少：${missingFields().join(', ')}`
            : decodeURIComponent(tabbyUrl);
    }

    function boot() {
        ensureButton();
        window.addEventListener('hashchange', ensureButton);
        window.addEventListener('popstate', ensureButton);
        window.setInterval(ensureButton, CONFIG.syncIntervalMs);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
