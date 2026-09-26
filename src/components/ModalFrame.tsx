import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const stack: HTMLElement[] = [];
let previousOverflow = '';
let previousRootOverflow = '';
let previousAppInert = false;

export function ModalFrame({ id, label, onClose, children }: {
  id: string; label: string; onClose: () => void; children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [viewport, setViewport] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    const el = root.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!stack.length) {
      previousOverflow = document.body.style.overflow;
      previousRootOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      const app = document.getElementById('root');
      previousAppInert = app?.inert ?? false;
      if (app) app.inert = true;
    }
    stack.push(el);
    el.style.zIndex = String(100 + stack.length * 10);
    const syncStack = () => stack.forEach((node,i) => { node.inert = i !== stack.length-1; });
    syncStack();
    const update = () => {
      const v = window.visualViewport;
      setViewport({ top: v?.offsetTop ?? 0, left: v?.offsetLeft ?? 0,
        width: v?.width ?? window.innerWidth, height: v?.height ?? window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    el.querySelector<HTMLElement>('[data-modal-close]')?.focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (stack.at(-1) !== el) return;
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key !== 'Tab') return;
      const focusable = (Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select,a[href],[tabindex="0"]')) as HTMLElement[]).filter(n=>n.getClientRects().length);
      const first=focusable[0], last=focusable.at(-1);
      if (!first) { e.preventDefault(); el.focus(); }
      else if (e.shiftKey && (document.activeElement===first || !el.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement===last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',keydown);
    return () => {
      stack.splice(stack.indexOf(el),1); syncStack();
      if (!stack.length) {
        document.body.style.overflow=previousOverflow;
        document.documentElement.style.overflow=previousRootOverflow;
        const app = document.getElementById('root');
        if (app) app.inert = previousAppInert;
      }
      window.removeEventListener('resize',update);
      window.visualViewport?.removeEventListener('resize',update);
      window.visualViewport?.removeEventListener('scroll',update);
      document.removeEventListener('keydown',keydown);
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    };
  }, []);
  return createPortal(<div ref={root} id={id} className="app-modal" style={viewport}
    role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>,document.body);
}
