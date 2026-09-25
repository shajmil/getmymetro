/**
 * The small controls, and the accessibility contracts they carry.
 *
 * The language switch is the one worth testing hardest. It is a *navigation*
 * dressed as a toggle, and getting that backwards would be expensive in a way
 * no visual check catches: the language lives in the URL
 * (`core/i18n/locale.ts`), `/ml/...` is 625 prerendered indexable pages, and
 * CLAUDE.md's search strategy 4 calls Malayalam transit queries uncontested.
 * A `<button>` that flipped a signal would make Malayalam a client-side
 * setting no crawler can reach — and it would look and feel identical.
 */

import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Alert, LanguageSwitch, SearchField } from './controls';

let fixture: ComponentFixture<unknown>;

async function render<T>(
  component: Type<T>,
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<T>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [provideRouter([])],
  }).compileComponents();

  const created = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    created.componentRef.setInput(name, value);
  }
  created.detectChanges();
  fixture = created as ComponentFixture<unknown>;
  return created;
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => fixture?.destroy());

describe('the language switch is a link, not a setting', () => {
  it('announces the selected segment with aria-pressed', async () => {
    await render(LanguageSwitch);
    const segments = [...host().querySelectorAll('.segment')];

    expect(segments).toHaveLength(2);
    expect(segments.map((el) => el.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('makes the unselected segment a real anchor to the other language', async () => {
    // This is the assertion that keeps 625 Malayalam pages reachable. A
    // button here would be invisible in review and fatal to the search
    // strategy.
    await render(LanguageSwitch);
    const other = host().querySelector('.segment[aria-pressed="false"]');

    expect(other?.tagName.toLowerCase()).toBe('a');
    expect(other?.getAttribute('href')).toBe('/ml');
    expect(other?.getAttribute('hreflang')).toBe('ml');
  });

  it('makes the selected segment a button rather than a self-link', async () => {
    await render(LanguageSwitch);
    const selected = host().querySelector('.segment[aria-pressed="true"]');

    expect(selected?.tagName.toLowerCase()).toBe('button');
    expect(selected?.getAttribute('href')).toBeNull();
  });

  it('labels each segment in the language it offers', async () => {
    await render(LanguageSwitch);
    const segments = [...host().querySelectorAll('.segment')];

    expect(segments.map((el) => el.textContent?.trim())).toEqual(['EN', 'മല']);
    expect(segments.map((el) => el.getAttribute('lang'))).toEqual(['en', 'ml']);
  });

  it('groups the two segments so they are announced as one control', async () => {
    await render(LanguageSwitch);
    const group = host().querySelector('[role="group"]');

    expect(group).not.toBeNull();
    expect(group?.getAttribute('aria-label')).toBe('Language');
  });
});

describe('the search field has a visible label', () => {
  it('ties a real label to a real input', async () => {
    // The placeholder carries the example and disappears on focus, which is
    // exactly why it cannot be the label (DESIGN.md §5.6).
    await render(SearchField, {
      inputId: 'destination',
      label: 'Where to?',
      placeholder: 'Station, in English or മലയാളം',
    });

    const label = host().querySelector('label');
    const input = host().querySelector('input');

    expect(label?.getAttribute('for')).toBe('destination');
    expect(input?.getAttribute('id')).toBe('destination');
    expect(label?.textContent?.trim()).toBe('Where to?');
    expect(input?.getAttribute('placeholder')).toBe('Station, in English or മലയാളം');
  });

  it('uses a real input element', async () => {
    await render(SearchField, { inputId: 'q', label: 'Where to?' });
    expect(host().querySelector('input')?.getAttribute('type')).toBe('search');
  });
});

describe('the alert announces itself', () => {
  it('carries role=alert and separates the title from the explanation', async () => {
    await render(Alert, {
      title: 'Timetable not updating',
      message: 'Showing times saved at 5:40 PM. Trains may differ.',
    });

    expect(host().getAttribute('role')).toBe('alert');
    expect(host().querySelector('.title')?.textContent?.trim()).toBe('Timetable not updating');
    expect(host().querySelector('.message')?.textContent?.trim()).toBe(
      'Showing times saved at 5:40 PM. Trains may differ.',
    );
  });

  it('hides its icon from assistive technology', async () => {
    // The icon repeats what the text says; announcing "graphic" adds nothing.
    await render(Alert, { title: 'Timetable not updating' });
    expect(host().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
