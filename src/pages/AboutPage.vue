<template>
  <div class="about">
    <h1 class="about__title">{{ t('about_title') }}</h1>
    <p class="muted">{{ t('about_lead') }}</p>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_sources') }}</span></div>
      <div class="panel__body">
        <p>{{ t('about_sources_body') }}</p>
        <p class="muted" v-html="t('about_sources_cors')" />
      </div>
    </section>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_license') }}</span></div>
      <div class="panel__body">
        <p>{{ t('about_license_body') }}</p>
        <p>
          {{ t('about_wealthfolio') }}
          <a href="https://github.com/wealthfolio/wealthfolio" target="_blank" rel="noreferrer">wealthfolio</a>
          {{ t('about_wealthfolio_tail') }}
        </p>
      </div>
    </section>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_order') }}</span></div>
      <div class="panel__body">
        <data-source-order />
      </div>
    </section>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_contribute') }}</span></div>
      <div class="panel__body">
        <p>
          <a :href="repoUrl" target="_blank" rel="noreferrer">{{ t('about_repo') }}</a> ·
          <a :href="issuesUrl" target="_blank" rel="noreferrer">{{ t('about_issues') }}</a> ·
          <a :href="deployDoc" target="_blank" rel="noreferrer">{{ t('about_deploy') }}</a> ·
          <a :href="contributing" target="_blank" rel="noreferrer">{{ t('about_contributing') }}</a> ·
          <a :href="security" target="_blank" rel="noreferrer">{{ t('about_security') }}</a>
        </p>
      </div>
    </section>

    <p><a href="#/">{{ t('about_back') }}</a></p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { DEPLOY_DOC, REPO_CONTRIBUTING, REPO_ISSUES_URL, REPO_SECURITY, REPO_URL } from '../config/site'
import DataSourceOrder from '../components/DataSourceOrder.vue'

const { t } = useI18n()
const repoUrl = REPO_URL
const issuesUrl = REPO_ISSUES_URL
const deployDoc = DEPLOY_DOC
const contributing = REPO_CONTRIBUTING
const security = REPO_SECURITY
</script>

<style scoped>
.about { max-width: 720px; margin: 28px auto 60px; display: grid; gap: 16px; }
.about__title { font-size: 24px; }
.about__block { overflow: hidden; }
.about p { margin: 0 0 8px; font-size: 13.5px; line-height: 1.7; }
.about .panel__body > p:last-child { margin-bottom: 0; }
</style>
