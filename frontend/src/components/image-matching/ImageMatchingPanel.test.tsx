import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageMatchingPanel from './ImageMatchingPanel';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('ImageMatchingPanel', () => {
  beforeEach(() => {
    mockApi = {
      matchImages: jest.fn(),
      getImageMatchingResults: jest.fn()
    };
  });

  it('runs matching with the selected strategy and threshold', async () => {
    mockApi.matchImages.mockResolvedValue({
      success: true,
      data: [
        {
          product_id: 'p1',
          matched_files: [{ filename: 'a.jpg' }],
          match_score: 0.95,
          match_strategy: 'ean',
          confidence: 0.9,
          reasons: []
        }
      ]
    });
    render(<ImageMatchingPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Strategy'), 'reference');
    await user.clear(screen.getByLabelText('Minimum threshold'));
    await user.type(screen.getByLabelText('Minimum threshold'), '0.5');
    await user.click(screen.getByRole('button', { name: 'Match images' }));

    await waitFor(() =>
      expect(mockApi.matchImages).toHaveBeenCalledWith('d1', {
        strategy: 'reference',
        threshold: 0.5,
        max_images_per_product: 5
      })
    );
    expect(await screen.findByText(/1 matches/)).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.getByText('0.95')).toBeInTheDocument();
  });

  it('loads existing matching results', async () => {
    mockApi.getImageMatchingResults.mockResolvedValue({
      success: true,
      data: []
    });
    render(<ImageMatchingPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load results' }));

    await waitFor(() => expect(mockApi.getImageMatchingResults).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText(/Results loaded \(0 matches\)/)).toBeInTheDocument();
  });

  it('shows an error when matching fails', async () => {
    mockApi.matchImages.mockRejectedValue(new Error('no images folder'));
    render(<ImageMatchingPanel dataId="d1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Match images' }));

    expect(await screen.findByText('no images folder')).toBeInTheDocument();
  });
});
