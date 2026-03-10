import { getUserV2, getUserByUsernameV2 } from './profile';
import { TwitterAuth } from './auth';

describe('Profile v2', () => {
  let mockAuth: jest.Mocked<TwitterAuth>;
  let mockV2Client: any;

  beforeEach(() => {
    mockV2Client = {
      v2: {
        user: jest.fn(),
        userByUsername: jest.fn(),
      },
    };

    mockAuth = {
      getV2Client: jest.fn().mockReturnValue(mockV2Client),
    } as any;
  });

  test('getUserV2 should call v2 user with correct params', async () => {
    mockV2Client.v2.user.mockResolvedValue({
      data: { id: '123', username: 'testuser' },
    });

    await getUserV2('123', mockAuth);

    expect(mockV2Client.v2.user).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        'user.fields': expect.arrayContaining([
          'description',
          'created_at',
          'location',
        ]),
      }),
    );
  });

  test('getUserByUsernameV2 should call v2 userByUsername with correct params', async () => {
    mockV2Client.v2.userByUsername.mockResolvedValue({
      data: { id: '123', username: 'testuser' },
    });

    await getUserByUsernameV2('testuser', mockAuth);

    expect(mockV2Client.v2.userByUsername).toHaveBeenCalledWith(
      'testuser',
      expect.objectContaining({
        'user.fields': expect.arrayContaining([
          'description',
          'created_at',
          'location',
        ]),
      }),
    );
  });

  test('should throw error if v2 client is not initialized', async () => {
    mockAuth.getV2Client.mockReturnValue(null);

    await expect(getUserV2('123', mockAuth)).rejects.toThrow(
      'Twitter v2 client is not initialized.',
    );
  });
});
