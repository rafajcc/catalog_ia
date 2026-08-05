import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestionsPanel from './SuggestionsPanel';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('SuggestionsPanel', () => {
  beforeEach(() => {
    mockApi = {
      generateTextSuggestions: jest.fn(),
      getTextSuggestions: jest.fn()
    };
  });

  it('generates suggestions with the selected fields and renders them', async () => {
    mockApi.generateTextSuggestions.mockResolvedValue({
      success: true,
      data: [
        {
          original_field: 'name',
          suggested_value: 'Premium Widget',
          confidence: 0.9,
          improvements: ['clearer']
        }
      ]
    });
    render(<SuggestionsPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    await waitFor(() =>
      expect(mockApi.generateTextSuggestions).toHaveBeenCalledWith('d1', {
        provider: 'mock',
        language: 'es',
        enabled_fields: ['name', 'description']
      })
    );
    expect(await screen.findByText('Premium Widget')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText(/Suggestions generated \(1 suggestions\)/)).toBeInTheDocument();
  });

  it('respects the field checkboxes when generating', async () => {
    mockApi.generateTextSuggestions.mockResolvedValue({ success: true, data: [] });
    render(<SuggestionsPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Name' }));
    await user.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    await waitFor(() =>
      expect(mockApi.generateTextSuggestions).toHaveBeenCalledWith('d1', {
        provider: 'mock',
        language: 'es',
        enabled_fields: ['description']
      })
    );
  });

  it('loads existing suggestions', async () => {
    mockApi.getTextSuggestions.mockResolvedValue({ success: true, data: [] });
    render(<SuggestionsPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load suggestions' }));

    await waitFor(() => expect(mockApi.getTextSuggestions).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText(/Suggestions loaded \(0 suggestions\)/)).toBeInTheDocument();
  });

  it('shows an error when generation fails', async () => {
    mockApi.generateTextSuggestions.mockRejectedValue(new Error('ai quota exceeded'));
    render(<SuggestionsPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    expect(await screen.findByText('ai quota exceeded')).toBeInTheDocument();
  });
});
