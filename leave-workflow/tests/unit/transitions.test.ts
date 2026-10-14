/**
 * transitions.test.ts — Unit tests for the FSM transition table and state utilities.
 * Tests every (state × action) pair and all aliases.
 */
import { describe, it, expect } from 'vitest';
import {
  findTransition,
  getAllowedTransitions,
  TRANSITION_TABLE,
} from '../../src/domain/transitions';
import { RequestState, resolveStatusFilter, TERMINAL_STATES } from '../../src/domain/states';
import type { Action } from '../../src/domain/states';

const ALL_STATES = Object.values(RequestState) as RequestState[];
const ALL_ACTIONS: Action[] = ['submit', 'approve', 'reject'];

// Build a set of valid (from, action) pairs from the table for quick lookup
const VALID_PAIRS = new Set(
  TRANSITION_TABLE.map((r) => `${r.from}:${r.action}`),
);

describe('findTransition', () => {
  it('returns the correct rule for every legal transition', () => {
    for (const rule of TRANSITION_TABLE) {
      const result = findTransition(rule.from, rule.action);
      expect(result).toBeDefined();
      expect(result?.to).toBe(rule.to);
      expect(result?.requiredRole).toBe(rule.requiredRole);
    }
  });

  it('returns undefined for every illegal (state × action) pair', () => {
    for (const state of ALL_STATES) {
      for (const action of ALL_ACTIONS) {
        if (!VALID_PAIRS.has(`${state}:${action}`)) {
          expect(findTransition(state, action)).toBeUndefined();
        }
      }
    }
  });

  // Spot-check key transitions
  it('draft + submit -> submitted by employee', () => {
    const r = findTransition('draft', 'submit');
    expect(r).toMatchObject({ to: 'submitted', requiredRole: 'employee' });
  });

  it('submitted + approve -> manager_approved by manager', () => {
    const r = findTransition('submitted', 'approve');
    expect(r).toMatchObject({ to: 'manager_approved', requiredRole: 'manager' });
  });

  it('manager_approved + approve -> hr_approved by hr', () => {
    const r = findTransition('manager_approved', 'approve');
    expect(r).toMatchObject({ to: 'hr_approved', requiredRole: 'hr' });
  });

  it('hr_approved + approve -> completed by hr', () => {
    const r = findTransition('hr_approved', 'approve');
    expect(r).toMatchObject({ to: 'completed', requiredRole: 'hr' });
  });

  it('submitted + reject -> rejected by manager', () => {
    const r = findTransition('submitted', 'reject');
    expect(r).toMatchObject({ to: 'rejected', requiredRole: 'manager' });
  });

  it('manager_approved + reject -> rejected by hr', () => {
    const r = findTransition('manager_approved', 'reject');
    expect(r).toMatchObject({ to: 'rejected', requiredRole: 'hr' });
  });

  it('hr_approved + reject -> rejected by hr', () => {
    const r = findTransition('hr_approved', 'reject');
    expect(r).toMatchObject({ to: 'rejected', requiredRole: 'hr' });
  });

  // Draft cannot be approved or rejected
  it('draft + approve -> undefined', () => {
    expect(findTransition('draft', 'approve')).toBeUndefined();
  });

  it('draft + reject -> undefined', () => {
    expect(findTransition('draft', 'reject')).toBeUndefined();
  });
});

describe('getAllowedTransitions', () => {
  it('draft: only submit', () => {
    const allowed = getAllowedTransitions('draft');
    expect(allowed).toHaveLength(1);
    expect(allowed[0].action).toBe('submit');
  });

  it('submitted: approve + reject', () => {
    const allowed = getAllowedTransitions('submitted');
    const actions = allowed.map((a) => a.action).sort();
    expect(actions).toEqual(['approve', 'reject']);
  });

  it('manager_approved: approve + reject', () => {
    const allowed = getAllowedTransitions('manager_approved');
    const actions = allowed.map((a) => a.action).sort();
    expect(actions).toEqual(['approve', 'reject']);
  });

  it('hr_approved: approve + reject', () => {
    const allowed = getAllowedTransitions('hr_approved');
    const actions = allowed.map((a) => a.action).sort();
    expect(actions).toEqual(['approve', 'reject']);
  });

  it('completed: empty (terminal)', () => {
    expect(getAllowedTransitions('completed')).toHaveLength(0);
  });

  it('rejected: empty (terminal)', () => {
    expect(getAllowedTransitions('rejected')).toHaveLength(0);
  });
});

describe('TERMINAL_STATES', () => {
  it('completed is terminal', () => {
    expect(TERMINAL_STATES.has('completed')).toBe(true);
  });

  it('rejected is terminal', () => {
    expect(TERMINAL_STATES.has('rejected')).toBe(true);
  });

  it('non-terminal states are not in the set', () => {
    const nonTerminal: RequestState[] = ['draft', 'submitted', 'manager_approved', 'hr_approved'];
    for (const s of nonTerminal) {
      expect(TERMINAL_STATES.has(s)).toBe(false);
    }
  });
});

describe('resolveStatusFilter', () => {
  it('pending_manager -> [submitted]', () => {
    expect(resolveStatusFilter('pending_manager')).toEqual(['submitted']);
  });

  it('pending_hr -> [manager_approved]', () => {
    expect(resolveStatusFilter('pending_hr')).toEqual(['manager_approved']);
  });

  it('pending_completion -> [hr_approved]', () => {
    expect(resolveStatusFilter('pending_completion')).toEqual(['hr_approved']);
  });

  it('pending -> [submitted, manager_approved, hr_approved]', () => {
    expect(resolveStatusFilter('pending')).toEqual([
      'submitted',
      'manager_approved',
      'hr_approved',
    ]);
  });

  it('exact state values resolve to [that state]', () => {
    for (const state of ALL_STATES) {
      expect(resolveStatusFilter(state)).toEqual([state]);
    }
  });

  it('unknown value returns null', () => {
    expect(resolveStatusFilter('bogus')).toBeNull();
    expect(resolveStatusFilter('')).toBeNull();
    expect(resolveStatusFilter('SUBMITTED')).toBeNull();
  });
});
