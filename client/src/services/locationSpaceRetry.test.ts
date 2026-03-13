import { describe, expect, it } from 'vitest';
import {
  buildLocationSpaceProposalRetryText,
  buildLocationSpaceRejectionSuggestions,
  buildLocationSpaceRetryGuidance,
  buildLocationSpaceValidationRetryText,
} from './locationSpaceRetry';

describe('locationSpaceRetry', () => {
  it('builds retry guidance from user rejection reason and spatial issues', () => {
    const result = buildLocationSpaceRetryGuidance({
      rejectedSpace: {
        name: 'Vault',
        purpose: 'Treasure room',
        wall_thickness_ft: 12,
        size_ft: { width: 20, height: 20 },
        doors: [
          { wall: 'east', position_on_wall_ft: 19, width_ft: 4, leads_to: 'Hall' },
        ],
      },
      existingSpaces: [
        {
          name: 'Hall',
          wall_thickness_ft: 4,
          size_ft: { width: 30, height: 20 },
        },
      ],
      userReason: 'The doorway is hanging off the wall and it does not pair with the hall.',
    });

    expect(result.rejectionFeedback).toContain('The doorway is hanging off the wall');
    expect(result.rejectionFeedback).toContain('Address these spatial issues:');
    expect(result.rejectionContext.rejected_space).toEqual(
      expect.objectContaining({
        name: 'Vault',
        wall_thickness_ft: 12,
        door_targets: ['Hall'],
      }),
    );
    expect(result.rejectionContext.retry_focus).toEqual(
      expect.arrayContaining(['doors', 'wall_thickness']),
    );
    expect(result.rejectionContext.geometry_issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'doors',
        }),
        expect.objectContaining({
          category: 'wall_thickness',
        }),
      ]),
    );
    expect(result.promptNotice).toEqual(
      expect.objectContaining({
        title: 'Retrying rejected space: Vault',
        tone: 'warning',
      }),
    );
    expect(result.promptNotice.message).toContain('Focus on doors, wall thickness');
    expect(result.promptNotice.message).toContain('User feedback:');
    expect(result.retrySource).toEqual(
      expect.objectContaining({
        kind: 'freeform_rejection',
        targetName: 'Vault',
      }),
    );
  });

  it('builds reusable rejection suggestions from detected geometry and door issues', () => {
    const suggestions = buildLocationSpaceRejectionSuggestions({
      spaceName: 'Vault',
      geometryProposals: [
        {
          category: 'doors',
          question: 'Door on east wall extends beyond the valid wall span.',
        },
        {
          category: 'wall_thickness',
          question: 'Wall thickness should match the connected Hall so doorways line up cleanly.',
        },
      ],
      validationErrors: [
        {
          type: 'invalid-door',
          message: 'Door 1 in Vault is positioned too close to the corner.',
        },
      ],
    });

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'detected-issues',
          label: 'Use detected issues',
        }),
        expect.objectContaining({
          id: 'geometry-doors',
          label: 'Use door issue',
        }),
        expect.objectContaining({
          id: 'validation-invalid-door',
          label: 'Use door validation',
        }),
      ]),
    );
    expect(suggestions[0]?.text).toContain('Replace "Vault"');
    expect(suggestions[0]?.retrySource).toEqual(
      expect.objectContaining({
        kind: 'detected_issues',
        targetName: 'Vault',
      }),
    );
  });

  it('builds precise retry text for a single geometry proposal or door validation error', () => {
    expect(
      buildLocationSpaceProposalRetryText({
        spaceName: 'Vault',
        proposal: {
          category: 'doors',
          question: 'Door on east wall extends beyond the valid wall span.',
        },
      }),
    ).toBe('Replace "Vault". Door on east wall extends beyond the valid wall span.');

    expect(
      buildLocationSpaceValidationRetryText({
        spaceName: 'Vault',
        validationError: {
          message: 'Door 1 in Vault is positioned too close to the corner.',
        },
      }),
    ).toBe('Replace "Vault". Door 1 in Vault is positioned too close to the corner.');
  });
});
