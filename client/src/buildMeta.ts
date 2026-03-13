import rootPackage from '../../package.json';

type BuildMetaEnv = ImportMetaEnv & {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_DATE?: string;
};

const env = import.meta.env as BuildMetaEnv;

export const APP_VERSION = env.DEV ? 'dev' : env.VITE_APP_VERSION || rootPackage.version;

export const BUILD_DATE = env.DEV ? '' : env.VITE_BUILD_DATE || '';
