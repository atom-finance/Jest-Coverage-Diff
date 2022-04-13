import * as core from '@actions/core'
import * as github from '@actions/github'
import {execSync} from 'child_process'
import fs from 'fs'
import {CoverageReport} from './Model/CoverageReport'
import {DiffChecker} from './DiffChecker'
import {Octokit} from '@octokit/core'
import {PaginateInterface} from '@octokit/plugin-paginate-rest'
import {RestEndpointMethods} from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types'

async function run(): Promise<void> {
  try {
    const repoName = github.context.repo.repo
    const repoOwner = github.context.repo.owner
    const githubToken = core.getInput('accessToken')
    const fullCoverage = JSON.parse(core.getInput('fullCoverageDiff'))
    const commandToRun = core.getInput('runCommand')
    const commandAfterSwitch = core.getInput('afterSwitchCommand')
    const githubClient = github.getOctokit(githubToken)
    const prNumber = github.context.issue.number
    const commentIdentifier = `<!-- codeCoverageDiffComment -->`

    execSync(commandToRun)
    const codeCoverageNew = <CoverageReport>(
      JSON.parse(fs.readFileSync('coverage-summary.json').toString())
    )

    execSync('/usr/bin/git fetch')
    execSync('/usr/bin/git stash')

    // Find SHA where head forks from base.
    const branchNameBase = execSync(
      '/usr/bin/git merge-base -a $HEAD_SHA $BASE_SHA'
    ).toString()

    execSync(`/usr/bin/git checkout --progress --force ${branchNameBase}`)
    if (commandAfterSwitch) {
      execSync(commandAfterSwitch)
    }
    execSync(commandToRun)
    const codeCoverageOld = <CoverageReport>(
      JSON.parse(fs.readFileSync('coverage-summary.json').toString())
    )
    const currentDirectory = execSync('pwd')
      .toString()
      .trim()
    const diffChecker: DiffChecker = new DiffChecker(
      codeCoverageNew,
      codeCoverageOld
    )
    let messageToPost = '## Test coverage results\n'
    const coverageDetails = diffChecker.getCoverageDetails(
      !fullCoverage,
      `${currentDirectory}/`
    )
    if (coverageDetails.length === 0) {
      messageToPost =
        'No changes to code coverage between the base branch and the head branch'
    } else {
      messageToPost +=
        'Status | File | % Stmts | % Branch | % Funcs | % Lines \n -----|-----|---------|----------|---------|------ \n'
      messageToPost += coverageDetails.join('\n')
    }
    messageToPost = `${commentIdentifier}\nCommit SHA: ${process.env['HEAD_SHA']}\n${messageToPost}`
    await githubClient.issues.createComment({
      repo: repoName,
      owner: repoOwner,
      body: messageToPost,
      issue_number: prNumber
    })
  } catch (error) {
    core.setFailed(error)
  }
}

run()
