#!/bin/bash
systemctl stop kadse
cp kadse.service /etc/systemd/system/
systemctl enable kadse
if (systemctl start kadse); then
  sleep 2
  if (systemctl is-active kadse >/dev/null); then
    echo 'Kadse service has been started successfully!'
  else
    echo 'ERROR: Failure after starting.'
  fi
  echo ''
  journalctl -u kadse -n 5 -o short --no-pager
else
  echo 'ERROR: The updater service could not be started.'
fi
