import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { join } from 'path';
import {
  hasChecklist,
  getChecklist,
  getChecklistProgress,
  getChecklistWithProgress,
  isValidChecklistStatus,
  isValidChecklistItem,
  isValidChecklist,
} from '../services/checklist-service';
import type { Checklist, ChecklistItem } from '../types';

// Mock the fs module
vi.mock('fs');
vi.mock('path');

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockJoin = vi.mocked(join);

const mockReaddirSync = vi.mocked(fs.readdirSync);

describe('checklist-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default path.join mock
    mockJoin.mockImplementation((...args: string[]) => {
      // Simple implementation: join all non-empty args with /
      const filtered = args.filter(
        (a) => a !== undefined && a !== null && a !== ''
      );
      if (filtered.length === 0) return '/';
      if (filtered.length === 1) return filtered[0];
      return filtered.join('/');
    });
  });

  describe('hasChecklist', () => {
    it('returns true when checklist file exists', () => {
      mockExistsSync.mockReturnValue(true);
      // Mock readdirSync to return matching file
      mockReaddirSync.mockReturnValue([
        'session-valid-loop-id-checklist.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      const result = hasChecklist('valid-loop-id');
      expect(result).toBe(true);
      expect(mockExistsSync).toHaveBeenCalled();
    });

    it('returns false when checklist file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = hasChecklist('valid-loop-id');
      expect(result).toBe(false);
    });

    it('returns false for invalid loop_id with path traversal', () => {
      mockExistsSync.mockReturnValue(false);
      const result = hasChecklist('../etc/passwd');
      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('returns false for invalid loop_id with special characters', () => {
      mockExistsSync.mockReturnValue(false);
      const result = hasChecklist('loop@id#123');
      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('returns false for empty loop_id', () => {
      mockExistsSync.mockReturnValue(false);
      const result = hasChecklist('');
      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('returns false for loop_id exceeding max length', () => {
      mockExistsSync.mockReturnValue(false);
      const longId = 'a'.repeat(257);
      const result = hasChecklist(longId);
      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('returns false for loop_id with null bytes', () => {
      mockExistsSync.mockReturnValue(false);
      const result = hasChecklist('loop\x00id');
      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });

    it('returns false for loop_id with absolute path pattern', () => {
      mockExistsSync.mockReturnValue(false);
      const result = hasChecklist('/etc/passwd');
      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
    });
  });

  describe('getChecklist', () => {
    const validChecklist: Checklist = {
      loop_id: 'test-loop-123',
      session_id: 'session-abc',
      project: '/path/to/project',
      project_name: 'test-project',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      task_checklist: [
        {
          id: 'task-1',
          text: 'First task',
          status: 'completed',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:30:00Z',
          completed_iteration: 5,
        },
        {
          id: 'task-2',
          text: 'Second task',
          status: 'in_progress',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: null,
          completed_iteration: null,
        },
      ],
      completion_criteria: [
        {
          id: 'criteria-1',
          text: 'First criteria',
          status: 'pending',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: null,
          completed_iteration: null,
        },
      ],
    };

    it('returns null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = getChecklist('valid-loop-id');
      expect(result).toBe(null);
    });

    it('returns parsed checklist when file exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        'session-valid-loop-id-checklist.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      mockReadFileSync.mockReturnValue(JSON.stringify(validChecklist));
      const result = getChecklist('valid-loop-id');
      expect(result).toEqual(validChecklist);
    });

    it('returns null for invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json{');
      const result = getChecklist('valid-loop-id');
      expect(result).toBe(null);
    });

    it('returns null when missing required fields (no loop_id)', () => {
      const incompleteChecklist = { ...validChecklist, loop_id: undefined };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(incompleteChecklist));
      const result = getChecklist('valid-loop-id');
      expect(result).toBe(null);
    });

    it('returns null when missing required fields (no task_checklist)', () => {
      const incompleteChecklist = {
        ...validChecklist,
        task_checklist: undefined,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(incompleteChecklist));
      const result = getChecklist('valid-loop-id');
      expect(result).toBe(null);
    });

    it('returns null when missing required fields (no completion_criteria)', () => {
      const incompleteChecklist = {
        ...validChecklist,
        completion_criteria: undefined,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(incompleteChecklist));
      const result = getChecklist('valid-loop-id');
      expect(result).toBe(null);
    });

    it('returns null for invalid loop_id', () => {
      const result = getChecklist('../etc/passwd');
      expect(result).toBe(null);
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('handles read file errors', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const result = getChecklist('valid-loop-id');
      expect(result).toBe(null);
    });
  });

  describe('getChecklistProgress', () => {
    const baseChecklist: Checklist = {
      loop_id: 'test-loop',
      session_id: 'session-1',
      project: '/path/to/project',
      project_name: 'test-project',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      task_checklist: [],
      completion_criteria: [],
    };

    it('calculates progress with mixed task statuses', () => {
      const checklist: Checklist = {
        ...baseChecklist,
        task_checklist: [
          {
            id: '1',
            text: 'Task 1',
            status: 'completed',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: '2',
            text: 'Task 2',
            status: 'pending',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: '3',
            text: 'Task 3',
            status: 'in_progress',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
        completion_criteria: [
          {
            id: 'c1',
            text: 'Criteria 1',
            status: 'completed',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: 'c2',
            text: 'Criteria 2',
            status: 'pending',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };
      const result = getChecklistProgress(checklist);
      expect(result).toEqual({
        tasks: '1/3 tasks',
        criteria: '1/2 criteria',
        tasksCompleted: 1,
        tasksTotal: 3,
        criteriaCompleted: 1,
        criteriaTotal: 2,
      });
    });

    it('calculates progress with all completed tasks', () => {
      const checklist: Checklist = {
        ...baseChecklist,
        task_checklist: [
          {
            id: '1',
            text: 'Task 1',
            status: 'completed',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: '2',
            text: 'Task 2',
            status: 'completed',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
        completion_criteria: [
          {
            id: 'c1',
            text: 'Criteria 1',
            status: 'completed',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };
      const result = getChecklistProgress(checklist);
      expect(result).toEqual({
        tasks: '2/2 tasks',
        criteria: '1/1 criteria',
        tasksCompleted: 2,
        tasksTotal: 2,
        criteriaCompleted: 1,
        criteriaTotal: 1,
      });
    });

    it('calculates progress with no completed tasks', () => {
      const checklist: Checklist = {
        ...baseChecklist,
        task_checklist: [
          {
            id: '1',
            text: 'Task 1',
            status: 'pending',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: '2',
            text: 'Task 2',
            status: 'in_progress',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
        completion_criteria: [
          {
            id: 'c1',
            text: 'Criteria 1',
            status: 'pending',
            created_at: '2024-01-15T10:00:00Z',
          },
        ],
      };
      const result = getChecklistProgress(checklist);
      expect(result).toEqual({
        tasks: '0/2 tasks',
        criteria: '0/1 criteria',
        tasksCompleted: 0,
        tasksTotal: 2,
        criteriaCompleted: 0,
        criteriaTotal: 1,
      });
    });

    it('calculates progress with empty arrays', () => {
      const checklist: Checklist = {
        ...baseChecklist,
        task_checklist: [],
        completion_criteria: [],
      };
      const result = getChecklistProgress(checklist);
      expect(result).toEqual({
        tasks: '0/0 tasks',
        criteria: '0/0 criteria',
        tasksCompleted: 0,
        tasksTotal: 0,
        criteriaCompleted: 0,
        criteriaTotal: 0,
      });
    });
  });

  describe('getChecklistWithProgress', () => {
    const validChecklist: Checklist = {
      loop_id: 'test-loop-123',
      session_id: 'session-abc',
      project: '/path/to/project',
      project_name: 'test-project',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      task_checklist: [
        {
          id: 'task-1',
          text: 'First task',
          status: 'completed',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:30:00Z',
          completed_iteration: 5,
        },
      ],
      completion_criteria: [
        {
          id: 'criteria-1',
          text: 'First criteria',
          status: 'pending',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: null,
          completed_iteration: null,
        },
      ],
    };

    it('returns checklist with progress when file exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        'session-valid-loop-id-checklist.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      mockReadFileSync.mockReturnValue(JSON.stringify(validChecklist));
      const result = getChecklistWithProgress('valid-loop-id');
      expect(result.checklist).toEqual(validChecklist);
      expect(result.progress).toEqual({
        tasks: '1/1 tasks',
        criteria: '0/1 criteria',
        tasksCompleted: 1,
        tasksTotal: 1,
        criteriaCompleted: 0,
        criteriaTotal: 1,
      });
    });

    it('returns null values when checklist not found', () => {
      mockExistsSync.mockReturnValue(false);
      const result = getChecklistWithProgress('valid-loop-id');
      expect(result.checklist).toBe(null);
      expect(result.progress).toBe(null);
    });

    it('returns null values for invalid loop_id', () => {
      const result = getChecklistWithProgress('../etc/passwd');
      expect(result.checklist).toBe(null);
      expect(result.progress).toBe(null);
    });
  });

  describe('isValidChecklistStatus', () => {
    it('returns true for valid statuses', () => {
      expect(isValidChecklistStatus('pending')).toBe(true);
      expect(isValidChecklistStatus('in_progress')).toBe(true);
      expect(isValidChecklistStatus('completed')).toBe(true);
    });

    it('returns false for invalid statuses', () => {
      expect(isValidChecklistStatus('invalid')).toBe(false);
      expect(isValidChecklistStatus('')).toBe(false);
      expect(isValidChecklistStatus('PENDING')).toBe(false);
      expect(isValidChecklistStatus('Pending')).toBe(false);
      expect(isValidChecklistStatus(undefined as unknown as string)).toBe(
        false
      );
      expect(isValidChecklistStatus(null as unknown as string)).toBe(false);
    });
  });

  describe('isValidChecklistItem', () => {
    const validItem: ChecklistItem = {
      id: 'item-1',
      text: 'Test item',
      status: 'pending',
      created_at: '2024-01-15T10:00:00Z',
      completed_at: null,
      completed_iteration: null,
    };

    it('returns true for valid item with null optional fields', () => {
      expect(isValidChecklistItem(validItem)).toBe(true);
    });

    it('returns true for valid item with undefined optional fields', () => {
      const item = {
        ...validItem,
        completed_at: undefined,
        completed_iteration: undefined,
      };
      expect(isValidChecklistItem(item)).toBe(true);
    });

    it('returns true for valid item with completed optional fields', () => {
      const item: ChecklistItem = {
        ...validItem,
        status: 'completed',
        completed_at: '2024-01-15T10:30:00Z',
        completed_iteration: 5,
      };
      expect(isValidChecklistItem(item)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidChecklistItem(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isValidChecklistItem('string')).toBe(false);
      expect(isValidChecklistItem(123)).toBe(false);
      expect(isValidChecklistItem([])).toBe(false);
      expect(isValidChecklistItem(undefined)).toBe(false);
    });

    it('returns false when missing required field id', () => {
      const { id, ...item } = validItem;
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false when missing required field text', () => {
      const { text, ...item } = validItem;
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false when missing required field status', () => {
      const { status, ...item } = validItem;
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false when missing required field created_at', () => {
      const { created_at, ...item } = validItem;
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false for invalid status', () => {
      const item = { ...validItem, status: 'invalid' };
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false for wrong type id', () => {
      const item = { ...validItem, id: 123 };
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false for wrong type text', () => {
      const item = { ...validItem, text: 123 };
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false for wrong type created_at', () => {
      const item = { ...validItem, created_at: 123 };
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false for invalid completed_at type', () => {
      const item = { ...validItem, completed_at: 123 };
      expect(isValidChecklistItem(item)).toBe(false);
    });

    it('returns false for invalid completed_iteration type', () => {
      const item = { ...validItem, completed_iteration: '5' };
      expect(isValidChecklistItem(item)).toBe(false);
    });
  });

  describe('isValidChecklist', () => {
    const validChecklist: Checklist = {
      loop_id: 'test-loop-123',
      session_id: 'session-abc',
      project: '/path/to/project',
      project_name: 'test-project',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      task_checklist: [
        {
          id: 'task-1',
          text: 'First task',
          status: 'completed',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:30:00Z',
          completed_iteration: 5,
        },
      ],
      completion_criteria: [
        {
          id: 'criteria-1',
          text: 'First criteria',
          status: 'pending',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: null,
          completed_iteration: null,
        },
      ],
    };

    it('returns true for valid checklist', () => {
      expect(isValidChecklist(validChecklist)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidChecklist(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isValidChecklist('string')).toBe(false);
      expect(isValidChecklist(123)).toBe(false);
      expect(isValidChecklist([])).toBe(false);
      expect(isValidChecklist(undefined)).toBe(false);
    });

    it('returns false when missing loop_id', () => {
      const { loop_id, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing session_id', () => {
      const { session_id, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing project', () => {
      const { project, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing project_name', () => {
      const { project_name, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing created_at', () => {
      const { created_at, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing updated_at', () => {
      const { updated_at, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing task_checklist', () => {
      const { task_checklist, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when missing completion_criteria', () => {
      const { completion_criteria, ...checklist } = validChecklist;
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when task_checklist is not an array', () => {
      const checklist = { ...validChecklist, task_checklist: 'not-array' };
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when completion_criteria is not an array', () => {
      const checklist = { ...validChecklist, completion_criteria: 'not-array' };
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when task_checklist contains invalid item', () => {
      const checklist = {
        ...validChecklist,
        task_checklist: [{ invalid: 'item' }],
      };
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns false when completion_criteria contains invalid item', () => {
      const checklist = {
        ...validChecklist,
        completion_criteria: [{ invalid: 'item' }],
      };
      expect(isValidChecklist(checklist)).toBe(false);
    });

    it('returns true for empty arrays', () => {
      const checklist = {
        ...validChecklist,
        task_checklist: [],
        completion_criteria: [],
      };
      expect(isValidChecklist(checklist)).toBe(true);
    });
  });
});
