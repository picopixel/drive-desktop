import { mockDeep } from 'vitest-mock-extended';
import { FolderRenamer } from '../../../../../src/context/virtual-drive/folders/application/FolderRenamer';
import { SynchronizeOfflineModifications } from '../../../../../src/context/virtual-drive/folders/application/SynchronizeOfflineModifications';
import { FolderPath } from '../../../../../src/context/virtual-drive/folders/domain/FolderPath';
import { FolderUuid } from '../../../../../src/context/virtual-drive/folders/domain/FolderUuid';
import { FolderRenamedDomainEvent } from '../../../../../src/context/virtual-drive/folders/domain/events/FolderRenamedDomainEvent';
import { InMemoryOfflineFolderRepository } from '../../../../../src/context/virtual-drive/folders/infrastructure/InMemoryOfflineFolderRepository';
import { FolderMother } from '../domain/FolderMother';
import { OfflineFolderMother } from '../domain/OfflineFolderMother';
import { FolderRepository } from '@/context/virtual-drive/folders/domain/FolderRepository';
import { SyncEngineIpc } from '@/apps/sync-engine/ipcRendererSyncEngine';
import { EventRepository } from '@/context/virtual-drive/shared/domain/EventRepository';
import { HttpRemoteFolderSystem } from '@/context/virtual-drive/folders/infrastructure/HttpRemoteFolderSystem';
import { fail } from 'assert';

describe('Synchronize Offline Modifications', () => {
  const offlineRepository = new InMemoryOfflineFolderRepository();
  const repository = mockDeep<FolderRepository>();
  const folderRemoteFileSystem = mockDeep<HttpRemoteFolderSystem>();
  const syncEngineIpc = mockDeep<SyncEngineIpc>();
  const renamer = new FolderRenamer(repository, folderRemoteFileSystem, syncEngineIpc);
  const eventRepositoryMock = mockDeep<EventRepository>();

  const SUT = new SynchronizeOfflineModifications(offlineRepository, repository, renamer, eventRepositoryMock);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does nothing if there is no offline folder with the given uuid', async () => {
    vi.spyOn(offlineRepository, 'searchByPartial').mockReturnValueOnce(undefined);

    await SUT.run(FolderUuid.random().value);

    expect(repository.searchByPartial).not.toBeCalled();
  });

  it('throws an error if there is no folder with the given uuid', async () => {
    vi.spyOn(offlineRepository, 'searchByPartial').mockReturnValueOnce(OfflineFolderMother.random());

    repository.searchByPartial.mockReturnValueOnce(undefined);

    try {
      await SUT.run(FolderUuid.random().value);
      fail('Expected SUT.run to throw an error, but it did not.');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('does nothing if the name of the online folder is not the previous one on the event', async () => {
    const offlineFolder = OfflineFolderMother.random();

    offlineFolder.rename(FolderPath.fromParts(offlineFolder.dirname, offlineFolder.name + '!'));

    const folder = FolderMother.fromPartial({
      ...offlineFolder.attributes(),
      path: offlineFolder.dirname + offlineFolder.name.repeat(1),
    });

    const offlineRepositorySyp = vi.spyOn(offlineRepository, 'searchByPartial').mockReturnValueOnce(offlineFolder);

    repository.searchByPartial.mockReturnValueOnce(folder);

    const renamerSpy = vi.spyOn(renamer, 'run');

    eventRepositoryMock.search.mockResolvedValueOnce([]);

    await SUT.run(offlineFolder.uuid);

    expect(offlineRepositorySyp).toBeCalledWith({ uuid: offlineFolder.uuid });
    expect(eventRepositoryMock.search).toBeCalledWith(offlineFolder.uuid);
    expect(renamerSpy).not.toBeCalled();
  });

  it('renames the online folder if the folder name is the previous one on the event', async () => {
    const offlineFolder = OfflineFolderMother.random();
    const folder = FolderMother.fromPartial(offlineFolder.attributes());

    offlineFolder.rename(FolderPath.fromParts(offlineFolder.dirname, offlineFolder.name + '!'));

    vi.spyOn(offlineRepository, 'searchByPartial').mockReturnValueOnce(offlineFolder);

    const renamerSpy = vi.spyOn(renamer, 'run');

    repository.searchByPartial.mockReturnValueOnce(folder);

    const event = new FolderRenamedDomainEvent({
      aggregateId: offlineFolder.uuid,
      previousPath: folder.path,
      nextPath: offlineFolder.path.value,
    });

    eventRepositoryMock.search.mockResolvedValueOnce([event]);

    await SUT.run(offlineFolder.uuid);

    expect(renamerSpy).toBeCalledWith(folder, offlineFolder.path);
  });

  it('makes all the name changes recoded on the events', async () => {
    const offlineFolder = OfflineFolderMother.random();
    const afterCreation = FolderMother.fromPartial(offlineFolder.attributes());

    offlineFolder.rename(FolderPath.fromParts(offlineFolder.dirname, offlineFolder.name + '!'));
    const afterFirstRename = FolderMother.fromPartial(offlineFolder.attributes());

    const event = new FolderRenamedDomainEvent({
      aggregateId: offlineFolder.uuid,
      previousPath: afterCreation.path,
      nextPath: afterFirstRename.path,
    });

    eventRepositoryMock.search.mockResolvedValueOnce([event]);

    vi.spyOn(offlineRepository, 'searchByPartial').mockReturnValueOnce(offlineFolder);

    const renamerSpy = vi.spyOn(renamer, 'run');

    repository.searchByPartial.mockReturnValueOnce(afterCreation).mockReturnValueOnce(afterFirstRename);

    const uuid = offlineFolder.uuid;

    await SUT.run(uuid);

    expect(renamerSpy).toBeCalledTimes(1);
  });
});
