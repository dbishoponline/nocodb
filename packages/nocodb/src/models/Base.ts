import type { BaseType, BoolType, MetaType } from 'nocodb-sdk';
import type { DB_TYPES } from '~/utils/globals';
import { BaseUser, Source } from '~/models';
import Noco from '~/Noco';
import {
  CacheDelDirection,
  CacheGetType,
  CacheScope,
  MetaTable,
} from '~/utils/globals';
import { extractProps } from '~/helpers/extractProps';
import NocoCache from '~/cache/NocoCache';
import { parseMetaProp, stringifyMetaProp } from '~/utils/modelUtils';
import NcConnectionMgrv2 from '~/utils/common/NcConnectionMgrv2';

export default class Base implements BaseType {
  public id: string;
  public title: string;
  public prefix: string;
  public status: string;
  public description: string;
  public meta: MetaType;
  public color: string;
  public deleted: BoolType;
  public order: number;
  public is_meta = false;
  public sources?: Source[];
  public linked_db_projects?: Base[];

  // shared base props
  uuid?: string;
  password?: string;
  roles?: string;

  constructor(base: Partial<Base>) {
    Object.assign(this, base);
  }

  public static castType(base: Base): Base {
    return base && new Base(base);
  }

  public static async createProject(
    base: Partial<BaseType>,
    ncMeta = Noco.ncMeta,
  ): Promise<Base> {
    const insertObj = extractProps(base, [
      'id',
      'title',
      'prefix',
      'description',
      'is_meta',
      'status',
      'meta',
      'color',
      'order',
    ]);

    if (!insertObj.order) {
      // get order value
      insertObj.order = await ncMeta.metaGetNextOrder(MetaTable.PROJECT, {});
    }

    // stringify meta
    if (insertObj.meta) {
      insertObj.meta = stringifyMetaProp(insertObj);
    }

    const { id: baseId } = await ncMeta.metaInsert2(
      null,
      null,
      MetaTable.PROJECT,
      insertObj,
    );

    for (const source of base.sources) {
      await Source.createBase(
        {
          type: source.config?.client as (typeof DB_TYPES)[number],
          ...source,
          baseId,
        },
        ncMeta,
      );
    }

    await NocoCache.del(CacheScope.INSTANCE_META);
    return this.getWithInfo(baseId, ncMeta).then(async (base) => {
      await NocoCache.appendToList(
        CacheScope.PROJECT,
        [],
        `${CacheScope.PROJECT}:${baseId}`,
      );
      return base;
    });
  }

  static async list(
    // @ts-ignore
    param,
    ncMeta = Noco.ncMeta,
  ): Promise<Base[]> {
    // todo: pagination
    const cachedList = await NocoCache.getList(CacheScope.PROJECT, []);
    let { list: baseList } = cachedList;
    const { isNoneList } = cachedList;
    if (!isNoneList && !baseList.length) {
      baseList = await ncMeta.metaList2(null, null, MetaTable.PROJECT, {
        xcCondition: {
          _or: [
            {
              deleted: {
                eq: false,
              },
            },
            {
              deleted: {
                eq: null,
              },
            },
          ],
        },
        orderBy: {
          order: 'asc',
        },
      });
      await NocoCache.setList(CacheScope.PROJECT, [], baseList);
    }

    const promises = [];

    const castedProjectList = baseList
      .filter(
        (p) => p.deleted === 0 || p.deleted === false || p.deleted === null,
      )
      .sort(
        (a, b) =>
          (a.order != null ? a.order : Infinity) -
          (b.order != null ? b.order : Infinity),
      )
      .map((p) => {
        const base = this.castType(p);
        promises.push(base.getSources(ncMeta));
        return base;
      });

    await Promise.all(promises);

    return castedProjectList;
  }

  // @ts-ignore
  static async get(baseId: string, ncMeta = Noco.ncMeta): Promise<Base> {
    let baseData =
      baseId &&
      (await NocoCache.get(
        `${CacheScope.PROJECT}:${baseId}`,
        CacheGetType.TYPE_OBJECT,
      ));
    if (!baseData) {
      baseData = await ncMeta.metaGet2(null, null, MetaTable.PROJECT, {
        id: baseId,
        deleted: false,
      });
      if (baseData) {
        baseData.meta = parseMetaProp(baseData);
        await NocoCache.set(`${CacheScope.PROJECT}:${baseId}`, baseData);
      }
    } else {
      if (baseData.deleted) {
        baseData = null;
      }
    }
    return this.castType(baseData);
  }

  async getSources(ncMeta = Noco.ncMeta): Promise<Source[]> {
    return (this.sources = await Source.list({ baseId: this.id }, ncMeta));
  }

  // todo: hide credentials
  // @ts-ignore
  static async getWithInfo(
    baseId: string,
    ncMeta = Noco.ncMeta,
  ): Promise<Base> {
    let baseData =
      baseId &&
      (await NocoCache.get(
        `${CacheScope.PROJECT}:${baseId}`,
        CacheGetType.TYPE_OBJECT,
      ));

    if (!baseData) {
      baseData = await ncMeta.metaGet2(null, null, MetaTable.PROJECT, {
        id: baseId,
        deleted: false,
      });
      if (baseData) {
        baseData.meta = parseMetaProp(baseData);
        await NocoCache.set(`${CacheScope.PROJECT}:${baseId}`, baseData);
      }
      if (baseData?.uuid) {
        await NocoCache.set(
          `${CacheScope.PROJECT_ALIAS}:${baseData.uuid}`,
          baseId,
        );
      }
    } else {
      if (baseData?.deleted) {
        baseData = null;
      }
    }
    if (baseData) {
      const base = this.castType(baseData);

      await base.getSources(ncMeta);

      return base;
    }
    return null;
  }

  // @ts-ignore
  static async softDelete(baseId: string, ncMeta = Noco.ncMeta): Promise<any> {
    await this.clearConnectionPool(baseId, ncMeta);

    // get existing cache
    const key = `${CacheScope.PROJECT}:${baseId}`;
    const o = await NocoCache.get(key, CacheGetType.TYPE_OBJECT);
    if (o) {
      // delete <scope>:<title>
      // delete <scope>:<uuid>
      // delete <scope>:ref:<titleOfId>
      await NocoCache.del([
        `${CacheScope.PROJECT_ALIAS}:${o.title}`,
        `${CacheScope.PROJECT_ALIAS}:${o.uuid}`,
        `${CacheScope.PROJECT_ALIAS}:ref:${o.title}`,
        `${CacheScope.PROJECT_ALIAS}:ref:${o.id}`,
      ]);
    }

    await NocoCache.del(CacheScope.INSTANCE_META);

    // remove item in cache list
    await NocoCache.deepDel(
      `${CacheScope.PROJECT}:${baseId}`,
      CacheDelDirection.CHILD_TO_PARENT,
    );

    // set meta
    return await ncMeta.metaUpdate(
      null,
      null,
      MetaTable.PROJECT,
      { deleted: true },
      baseId,
    );
  }

  // @ts-ignore
  static async update(
    baseId: string,
    base: Partial<Base>,
    ncMeta = Noco.ncMeta,
  ): Promise<any> {
    const updateObj = extractProps(base, [
      'title',
      'prefix',
      'status',
      'description',
      'meta',
      'color',
      'deleted',
      'order',
      'sources',
      'uuid',
      'password',
      'roles',
    ]);

    // get existing cache
    const key = `${CacheScope.PROJECT}:${baseId}`;
    let o = await NocoCache.get(key, CacheGetType.TYPE_OBJECT);
    if (o) {
      // update data
      // new uuid is generated
      if (o.uuid && updateObj.uuid && o.uuid !== updateObj.uuid) {
        await NocoCache.del(`${CacheScope.PROJECT_ALIAS}:${o.uuid}`);
        await NocoCache.set(
          `${CacheScope.PROJECT_ALIAS}:${updateObj.uuid}`,
          baseId,
        );
      }
      // disable shared base
      if (o.uuid && updateObj.uuid === null) {
        await NocoCache.del(`${CacheScope.PROJECT_ALIAS}:${o.uuid}`);
      }
      if (o.title && updateObj.title && o.title !== updateObj.title) {
        await NocoCache.del(`${CacheScope.PROJECT_ALIAS}:${o.title}`);
        await NocoCache.set(
          `${CacheScope.PROJECT_ALIAS}:${updateObj.title}`,
          baseId,
        );
      }
      o = { ...o, ...updateObj };

      await NocoCache.del(CacheScope.INSTANCE_META);

      // set cache
      await NocoCache.set(key, o);
    }

    // stringify meta
    if (updateObj.meta) {
      updateObj.meta = stringifyMetaProp(updateObj);
    }

    // set meta
    return await ncMeta.metaUpdate(
      null,
      null,
      MetaTable.PROJECT,
      updateObj,
      baseId,
    );
  }

  // Todo: Remove the base entry from the connection pool in NcConnectionMgrv2
  static async delete(baseId, ncMeta = Noco.ncMeta): Promise<any> {
    let base = await this.get(baseId);
    const users = await BaseUser.getUsersList({
      base_id: baseId,
    });

    for (const user of users) {
      await BaseUser.delete(baseId, user.id);
    }

    const sources = await Source.list({ baseId });
    for (const source of sources) {
      await source.delete(ncMeta);
    }
    base = await this.get(baseId);

    if (base) {
      // delete <scope>:<uuid>
      // delete <scope>:<title>
      // delete <scope>:ref:<titleOfId>
      await NocoCache.del([
        `${CacheScope.PROJECT_ALIAS}:${base.uuid}`,
        `${CacheScope.PROJECT_ALIAS}:${base.title}`,
        `${CacheScope.PROJECT_ALIAS}:ref:${base.title}`,
        `${CacheScope.PROJECT_ALIAS}:ref:${base.id}`,
      ]);
    }

    await NocoCache.deepDel(
      `${CacheScope.PROJECT}:${baseId}`,
      CacheDelDirection.CHILD_TO_PARENT,
    );

    await ncMeta.metaDelete(null, null, MetaTable.AUDIT, {
      base_id: baseId,
    });

    return await ncMeta.metaDelete(null, null, MetaTable.PROJECT, baseId);
  }

  static async getByUuid(uuid, ncMeta = Noco.ncMeta) {
    const baseId =
      uuid &&
      (await NocoCache.get(
        `${CacheScope.PROJECT_ALIAS}:${uuid}`,
        CacheGetType.TYPE_STRING,
      ));
    let baseData = null;
    if (!baseId) {
      baseData = await Noco.ncMeta.metaGet2(null, null, MetaTable.PROJECT, {
        uuid,
      });
      if (baseData) {
        baseData.meta = parseMetaProp(baseData);
        await NocoCache.set(
          `${CacheScope.PROJECT_ALIAS}:${uuid}`,
          baseData?.id,
        );
      }
    } else {
      return this.get(baseId);
    }
    return baseData?.id && this.get(baseData?.id, ncMeta);
  }

  static async getWithInfoByTitle(title: string, ncMeta = Noco.ncMeta) {
    const base = await this.getByTitle(title, ncMeta);
    if (base) {
      await base.getSources(ncMeta);
    }

    return base;
  }

  static async getByTitle(title: string, ncMeta = Noco.ncMeta) {
    const baseId =
      title &&
      (await NocoCache.get(
        `${CacheScope.PROJECT_ALIAS}:${title}`,
        CacheGetType.TYPE_STRING,
      ));
    let baseData = null;
    if (!baseId) {
      baseData = await Noco.ncMeta.metaGet2(null, null, MetaTable.PROJECT, {
        title,
        deleted: false,
      });
      if (baseData) {
        baseData.meta = parseMetaProp(baseData);
        await NocoCache.set(
          `${CacheScope.PROJECT_ALIAS}:${title}`,
          baseData?.id,
        );
      }
    } else {
      return this.get(baseId);
    }
    return baseData?.id && this.get(baseData?.id, ncMeta);
  }

  static async getByTitleOrId(titleOrId: string, ncMeta = Noco.ncMeta) {
    const baseId =
      titleOrId &&
      (await NocoCache.get(
        `${CacheScope.PROJECT_ALIAS}:ref:${titleOrId}`,
        CacheGetType.TYPE_STRING,
      ));
    let baseData = null;
    if (!baseId) {
      baseData = await Noco.ncMeta.metaGet2(
        null,
        null,
        MetaTable.PROJECT,
        {
          deleted: false,
        },
        null,
        {
          _or: [
            {
              id: {
                eq: titleOrId,
              },
            },
            {
              title: {
                eq: titleOrId,
              },
            },
          ],
        },
      );

      if (baseData) {
        // parse meta
        baseData.meta = parseMetaProp(baseData);

        await NocoCache.set(
          `${CacheScope.PROJECT_ALIAS}:ref:${titleOrId}`,
          baseData?.id,
        );
      }
    } else {
      return this.get(baseId);
    }
    return baseData?.id && this.get(baseData?.id, ncMeta);
  }

  static async getWithInfoByTitleOrId(titleOrId: string, ncMeta = Noco.ncMeta) {
    const base = await this.getByTitleOrId(titleOrId, ncMeta);

    // parse meta
    base.meta = parseMetaProp(base);

    if (base) {
      await base.getSources(ncMeta);
    }

    return base;
  }

  static async clearConnectionPool(baseId: string, ncMeta = Noco.ncMeta) {
    const base = await this.get(baseId, ncMeta);
    if (base) {
      const sources = await base.getSources(ncMeta);
      for (const source of sources) {
        await NcConnectionMgrv2.deleteAwait(source);
      }
    }
  }
}
