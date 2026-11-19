<template>
  <div class="about">
    <h1 class="about__title">{{ t('about_title') }}</h1>
    <p class="muted">{{ t('about_lead') }}</p>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_sources') }}</span></div>
      <div class="panel__body">
        <p>{{ t('about_sources_body') }}</p>
        <p>{{ t('about_sources_timing') }}</p>
      </div>
    </section>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_method_title') }}</span></div>
      <div class="panel__body">
        <p>{{ t('about_method_body') }}</p>
        <p><a href="#/method">{{ t('disc_policy_link') }}</a></p>
      </div>
    </section>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_license') }}</span></div>
      <div class="panel__body">
        <p>{{ t('about_license_body') }}</p>
        <p><a :href="REPO_URL + '/blob/main/ATTRIBUTION.md'" target="_blank" rel="noreferrer">{{ t('about_data_credits') }}</a></p>
      </div>
    </section>

    <section class="panel about__block">
      <div class="panel__head"><span class="panel__title">{{ t('about_feedback') }}</span></div>
      <div class="panel__body">
        <p>{{ t('about_feedback_body') }}</p>
        <p>
          <a :href="REPO_ISSUES_URL" target="_blank" rel="noreferrer">{{ t('about_issues') }}</a> ·
          <a :href="REPO_URL" target="_blank" rel="noreferrer">{{ t('about_repo') }}</a>
        </p>
      </div>
    </section>

    <p><a href="#/">{{ t('about_back') }}</a></p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { REPO_ISSUES_URL, REPO_URL } from '../config/site'

const { t } = useI18n()
</script>

<style scoped>
.about { max-width: 720px; margin: 28px auto 60px; display: grid; gap: 16px; }
.about__title { font-size: 24px; }
.about__block { overflow: hidden; }
.about p { margin: 0 0 8px; font-size: 15px; line-height: 1.7; }
.about .panel__body > p:last-child { margin-bottom: 0; }
</style>
