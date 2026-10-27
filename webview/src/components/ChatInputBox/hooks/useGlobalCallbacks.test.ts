import { renderHook } from '@testing-library/react';
import { useGlobalCallbacks } from './useGlobalCallbacks.js';

function createEditable(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  document.body.appendChild(el);

  if (typeof (el as HTMLDivElement & { innerText?: string }).innerText === 'undefined') {
    Object.defineProperty(el, 'innerText', {
      get() {
        return readEditableText(this as HTMLDivElement);
      },
      set(value: string) {
        this.textContent = value;
      },
      configurable: true,
    });
  }

  return el;
}

function readEditableText(element: HTMLDivElement): string {
  let text = '';
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (node.nodeName === 'BR') {
      text += '\n';
    }
  });
  return text;
}

function placeCaretInsideFirstTextNode(element: HTMLDivElement, offset: number): void {
  const textNode = element.firstChild;
  if (!textNode) {
    throw new Error('editable has no text node');
  }
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function renderUseGlobalCallbacks(editable: HTMLDivElement) {
  const pathMappingRef = { current: new Map<string, string>() };
  const setHasContent = vi.fn();
  const adjustHeight = vi.fn();
  const renderFileTags = vi.fn();
  const renderQuoteTags = vi.fn();
  const onInput = vi.fn();
  const closeAllCompletions = vi.fn();
  const focusInput = vi.fn(() => editable.focus());
  const getTextContent = () => readEditableText(editable);

  renderHook(() =>
    useGlobalCallbacks({
      editableRef: { current: editable },
      pathMappingRef,
      getTextContent,
      adjustHeight,
      renderFileTags,
      renderQuoteTags,
      setHasContent,
      onInput,
      closeAllCompletions,
      focusInput,
    })
  );

  return {
    getTextContent,
    pathMappingRef,
    setHasContent,
    adjustHeight,
    renderFileTags,
    onInput,
  };
}

describe('useGlobalCallbacks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    delete window.insertCodeSnippetAtCursor;
    delete window.insertFileReferencesAtCursor;
    delete window.handleFilePathFromJava;
    document.body.innerHTML = '';
  });

  it('appends external snippet directly when input is empty', () => {
    const editable = createEditable();
    const { getTextContent } = renderUseGlobalCallbacks(editable);

    window.insertCodeSnippetAtCursor?.('console payload');
    vi.runAllTimers();

    expect(getTextContent()).toBe('console payload ');
  });

  it('appends external snippet on a new line when input already has content', () => {
    const editable = createEditable();
    editable.appendChild(document.createTextNode('draft question'));
    const { getTextContent } = renderUseGlobalCallbacks(editable);

    window.insertCodeSnippetAtCursor?.('console payload');
    vi.runAllTimers();

    expect(getTextContent()).toBe('draft question\nconsole payload ');
  });

  it('inserts external snippet at caret position when caret is inside editable', () => {
    const editable = createEditable();
    editable.appendChild(document.createTextNode('abc'));
    placeCaretInsideFirstTextNode(editable, 1);
    const { getTextContent } = renderUseGlobalCallbacks(editable);

    window.insertCodeSnippetAtCursor?.('XYZ');
    vi.runAllTimers();

    expect(getTextContent()).toBe('aXYZ bc');
  });

  it('falls back to appending at end when caret is not inside editable', () => {
    const editable = createEditable();
    editable.appendChild(document.createTextNode('draft question'));
    // Place caret outside editable to simulate external action (e.g. project tree right-click)
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    const { getTextContent } = renderUseGlobalCallbacks(editable);

    window.insertCodeSnippetAtCursor?.('@/path/to/file');
    vi.runAllTimers();

    expect(getTextContent()).toBe('draft question\n@/path/to/file ');
  });

  it('registers multiple dedicated absolute file references before rendering', () => {
    const editable = createEditable();
    const { getTextContent, pathMappingRef } = renderUseGlobalCallbacks(editable);

    window.insertFileReferencesAtCursor?.([
      'C:\\project\\templates\\view file.xml',
      'C:\\project\\pages\\index.vue',
    ]);
    vi.runAllTimers();

    expect(getTextContent()).toBe(
      '@C:\\project\\templates\\view file.xml @C:\\project\\pages\\index.vue '
    );
    expect(pathMappingRef.current.get('view file.xml')).toBe(
      'C:\\project\\templates\\view file.xml'
    );
    expect(pathMappingRef.current.get('index.vue')).toBe(
      'C:\\project\\pages\\index.vue'
    );
  });

  it('keeps a generic code snippet separate from file-list parsing', () => {
    const editable = createEditable();
    const { pathMappingRef } = renderUseGlobalCallbacks(editable);

    window.insertCodeSnippetAtCursor?.(
      '@C:\\project\\templates\\view file.xml @C:\\project\\pages\\index.vue'
    );
    vi.runAllTimers();

    expect(pathMappingRef.current.size).toBe(0);
  });

  it('registers a strict line-number reference with spaces through the generic bridge', () => {
    const editable = createEditable();
    const { getTextContent, pathMappingRef } = renderUseGlobalCallbacks(editable);

    window.insertCodeSnippetAtCursor?.('@C:\\Program Files\\src\\Main.java#L10-12');
    vi.runAllTimers();

    expect(getTextContent()).toBe('@C:\\Program Files\\src\\Main.java#L10-12 ');
    expect(pathMappingRef.current.get('C:\\Program Files\\src\\Main.java')).toBe(
      'C:\\Program Files\\src\\Main.java'
    );
    expect(pathMappingRef.current.get('C:\\Program Files\\src\\Main.java#L10-12')).toBe(
      'C:\\Program Files\\src\\Main.java'
    );
  });
});
