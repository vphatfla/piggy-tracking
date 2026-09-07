#!/bin/bash
# Brings the box to "ready for docker compose" and nothing further —
# deliberately does not clone the repo or start the app. That's the next
# task (GitHub Actions deploy), not this one. See terraform/README.md.
set -euo pipefail

# --- Docker + the Compose plugin -------------------------------------------
# AL2023's own AMI already ships docker (this install is a no-op / safety net
# for a future AMI that doesn't) - confirmed on the actual instance. But its
# dnf repos do NOT carry docker-compose-plugin at all (that's a Docker CE
# apt/yum repo package, AL2023 isn't on that repo) - confirmed the hard way,
# `dnf install` failed outright and aborted the rest of this script under
# set -e. The compose plugin has to come from a direct binary download.
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

compose_dir="/usr/local/lib/docker/cli-plugins"
mkdir -p "$compose_dir"
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64" \
  -o "$compose_dir/docker-compose"
chmod +x "$compose_dir/docker-compose"

# --- Swap ---------------------------------------------------------------
# t4g.nano's 512MB is genuinely tight for Postgres + Node + Docker together
# (see variables.tf's instance_type comment) - this absorbs a memory spike
# with the OOM killer instead of it firing on a personal app that otherwise
# has near-zero concurrent load. Idempotent: skip if it already exists, so a
# re-run of this script never re-creates or re-enables it.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Format (once) and mount the EBS data volume ---------------------------
# ${device} is templated in by Terraform's templatefile() — see main.tf.
# On Nitro instances (which everything current, including t4g, is) EBS
# volumes surface as NVMe devices; AL2023's udev rules create the
# /dev/xvdf-style symlink for the name requested in the volume attachment,
# so this device path is the one Terraform actually asked for.
# shellcheck disable=SC2269  # not a self-assignment — ${device} on the
# right is Terraform's templatefile() interpolation, substituted before this
# ever reaches bash; shellcheck can't see that distinction from the raw text.
device="${device}"
mount_point="/mnt/piggy-data"

# Wait for the device to actually appear — attachment can lag instance boot.
for _ in $(seq 1 30); do
  [ -e "$device" ] && break
  sleep 2
done

# blkid returns non-zero (and prints nothing) on a blank volume — that's the
# "format it" signal. Never mkfs a device that already has a filesystem: a
# reboot, or Terraform replacing the instance while keeping the volume,
# must not wipe real Postgres data.
if ! blkid "$device" >/dev/null 2>&1; then
  mkfs -t ext4 "$device"
fi

mkdir -p "$mount_point"
mount "$device" "$mount_point"

# Idempotent: only append the fstab entry if it isn't already there, so a
# re-run of this script (e.g. a future cloud-init re-execution) doesn't
# duplicate the line.
fstab_entry="$device $mount_point ext4 defaults,nofail 0 2"
grep -qsF "$device" /etc/fstab || echo "$fstab_entry" >> /etc/fstab

mkdir -p "$mount_point/postgres"
