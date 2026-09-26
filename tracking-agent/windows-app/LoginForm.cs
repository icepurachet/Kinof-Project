namespace Kinof.Agent;

internal sealed class LoginForm : Form
{
    private static readonly Color Navy = Color.FromArgb(6, 19, 46);
    private static readonly Color NavyMid = Color.FromArgb(18, 59, 130);
    private static readonly Color Gold = Color.FromArgb(201, 162, 39);
    private static readonly Color Ink = Color.FromArgb(15, 23, 42);
    private static readonly Color Muted = Color.FromArgb(100, 116, 139);
    private static readonly Color Page = Color.FromArgb(248, 250, 252);
    private static readonly Color Line = Color.FromArgb(226, 232, 240);
    private static readonly Color Danger = Color.FromArgb(185, 28, 28);
    private static readonly Color Ok = Color.FromArgb(5, 122, 85);

    private readonly AgentApiClient _api;
    private readonly AgentSessionState _session;
    private readonly NotifyIcon _tray;
    private readonly Label _seatLabel;
    private readonly Label _statusLabel;
    private readonly Panel _credentialsPanel;
    private readonly Panel _otpPanel;
    private readonly Panel _signedInPanel;
    private readonly TextBox _username;
    private readonly TextBox _password;
    private readonly TextBox _otp;
    private readonly Label _otpHint;
    private readonly Label _signedInName;
    private readonly Button _loginButton;
    private readonly Button _verifyButton;
    private readonly Button _resendButton;
    private readonly Button _logoutButton;

    private bool _busy;
    private bool _allowExit;
    private long _pendingUserId;
    private string _maskedEmail = "";

    public LoginForm(AgentApiClient api, AgentSessionState session)
    {
        _api = api;
        _session = session;

        Text = "KINOF";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        ClientSize = new Size(360, 468);
        BackColor = Page;
        Font = new Font("Segoe UI", 10f);
        Icon = SystemIcons.Shield;
        DoubleBuffered = true;

        var header = BuildHeader(out _seatLabel);

        _statusLabel = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 40,
            AutoSize = false,
            Padding = new Padding(24, 8, 24, 8),
            ForeColor = Muted,
            Text = "ปิดหน้าต่างแล้วโปรแกรมยังอยู่ที่ถาดระบบ"
        };

        var card = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(28, 20, 28, 12)
        };

        _credentialsPanel = BuildCredentials(out _username, out _password, out _loginButton);
        _otpPanel = BuildOtp(out _otp, out _otpHint, out _verifyButton, out _resendButton);
        _signedInPanel = BuildSignedIn(out _signedInName, out _logoutButton);

        card.Controls.Add(_signedInPanel);
        card.Controls.Add(_otpPanel);
        card.Controls.Add(_credentialsPanel);

        Controls.Add(card);
        Controls.Add(_statusLabel);
        Controls.Add(header);

        _tray = BuildTray();
        AcceptButton = _loginButton;
        _session.Changed += OnSessionChanged;
        Load += (_, _) => RefreshView();
        Resize += OnResize;
        FormClosing += OnClosing;
        FormClosed += (_, _) =>
        {
            _tray.Visible = false;
            _tray.Dispose();
        };
    }

    private Panel BuildHeader(out Label seatLabel)
    {
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 72,
            BackColor = Navy
        };
        header.Controls.Add(new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 2,
            BackColor = Gold
        });
        header.Controls.Add(new Label
        {
            Text = "KINOF",
            ForeColor = Gold,
            Font = new Font("Segoe UI Semibold", 16f),
            AutoSize = true,
            Location = new Point(24, 10)
        });
        seatLabel = new Label
        {
            Text = "กำลังเชื่อมต่อ…",
            ForeColor = Color.FromArgb(203, 213, 225),
            Font = new Font("Segoe UI", 9f),
            AutoSize = true,
            Location = new Point(26, 40)
        };
        header.Controls.Add(seatLabel);
        return header;
    }

    private NotifyIcon BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("เปิดหน้าต่าง", null, (_, _) => RestoreWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("ปิดโปรแกรม", null, async (_, _) => await ExitFromTrayAsync());

        var tray = new NotifyIcon
        {
            Icon = SystemIcons.Shield,
            Text = "KINOF",
            Visible = true,
            ContextMenuStrip = menu
        };
        tray.DoubleClick += (_, _) => RestoreWindow();
        return tray;
    }

    private Panel BuildCredentials(out TextBox username, out TextBox password, out Button loginButton)
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        panel.Controls.Add(Title("เข้าสู่ระบบ"));

        var userField = Field("ชื่อผู้ใช้หรืออีเมล", 48);
        username = userField.Box;
        var passField = Field("รหัสผ่าน", 104);
        password = passField.Box;
        password.UseSystemPasswordChar = true;

        loginButton = PrimaryButton("เข้าสู่ระบบ", 176);
        loginButton.Click += async (_, _) => await LoginAsync();

        panel.Controls.Add(loginButton);
        panel.Controls.Add(passField.Wrap);
        panel.Controls.Add(userField.Wrap);
        return panel;
    }

    private Panel BuildOtp(out TextBox otp, out Label hint, out Button verifyButton, out Button resendButton)
    {
        var panel = new Panel { Dock = DockStyle.Fill, Visible = false };
        panel.Controls.Add(Title("ยืนยัน OTP"));

        hint = new Label
        {
            Location = new Point(0, 44),
            Size = new Size(304, 36),
            ForeColor = Muted,
            Font = new Font("Segoe UI", 9f)
        };

        var otpField = Field("รหัส 6 หลัก", 88);
        otp = otpField.Box;
        otp.MaxLength = 6;
        otp.TextAlign = HorizontalAlignment.Center;
        otp.Font = new Font("Segoe UI Semibold", 16f);

        verifyButton = PrimaryButton("ยืนยัน", 148);
        verifyButton.Click += async (_, _) => await VerifyAsync();

        resendButton = GhostButton("ส่งใหม่", 204, 0);
        resendButton.Click += async (_, _) => await ResendAsync();

        var back = GhostButton("กลับ", 204, 156);
        back.Click += (_, _) =>
        {
            _pendingUserId = 0;
            ShowPanel(_credentialsPanel);
        };

        panel.Controls.Add(back);
        panel.Controls.Add(resendButton);
        panel.Controls.Add(verifyButton);
        panel.Controls.Add(otpField.Wrap);
        panel.Controls.Add(hint);
        return panel;
    }

    private Panel BuildSignedIn(out Label name, out Button logoutButton)
    {
        var panel = new Panel { Dock = DockStyle.Fill, Visible = false };
        panel.Controls.Add(Title("กำลังใช้เครื่องนี้"));

        name = new Label
        {
            Location = new Point(0, 52),
            Size = new Size(304, 40),
            Font = new Font("Segoe UI Semibold", 14f),
            ForeColor = Navy
        };

        logoutButton = DangerButton("ออกจากระบบเครื่องนี้", 128);
        logoutButton.Click += async (_, _) => await LogoutAsync();

        panel.Controls.Add(logoutButton);
        panel.Controls.Add(name);
        return panel;
    }

    private async Task LoginAsync()
    {
        if (_busy) return;
        _busy = true;
        SetBusy(true);
        try
        {
            var result = await _api.StartLoginAsync(_username.Text.Trim(), _password.Text, CancellationToken.None);
            _pendingUserId = result.UserId;
            _maskedEmail = result.MaskedEmail ?? "";
            _otp.Text = "";
            _otpHint.Text = !string.IsNullOrWhiteSpace(result.DevOtp)
                ? $"โหมดทดสอบ — รหัสคือ {result.DevOtp}"
                : $"ส่งไปที่ {_maskedEmail}";
            ShowPanel(_otpPanel);
            _otp.Focus();
            AcceptButton = _verifyButton;
            SetStatus("กรอกรหัสจากอีเมลบัญชี KINOF", false);
        }
        catch (Exception ex)
        {
            SetStatus(ex.Message, true);
        }
        finally
        {
            _busy = false;
            SetBusy(false);
        }
    }

    private async Task VerifyAsync()
    {
        if (_busy) return;
        _busy = true;
        SetBusy(true);
        try
        {
            var result = await _api.VerifyOtpAsync(_pendingUserId, _otp.Text.Trim(), CancellationToken.None);
            if (result.User is null)
                throw new HttpRequestException("ยืนยัน OTP ไม่สำเร็จ");
            _password.Text = "";
            _otp.Text = "";
            _session.SetLoggedIn(result.User);
            SetStatus("ล็อกอินแล้ว ที่นั่งนี้ถูกใช้งาน", false);
            _tray.Text = $"KINOF — {_session.User?.DisplayName ?? _session.User?.Username}";
        }
        catch (Exception ex)
        {
            SetStatus(ex.Message, true);
        }
        finally
        {
            _busy = false;
            SetBusy(false);
        }
    }

    private async Task ResendAsync()
    {
        if (_busy || _pendingUserId == 0) return;
        _busy = true;
        SetBusy(true);
        try
        {
            var result = await _api.ResendOtpAsync(_pendingUserId, CancellationToken.None);
            _maskedEmail = string.IsNullOrWhiteSpace(result.MaskedEmail) ? _maskedEmail : result.MaskedEmail;
            if (!string.IsNullOrWhiteSpace(result.DevOtp))
                _otpHint.Text = $"โหมดทดสอบ — รหัสใหม่คือ {result.DevOtp}";
            else
                _otpHint.Text = $"ส่งใหม่ไปที่ {_maskedEmail}";
            SetStatus(
                string.IsNullOrWhiteSpace(result.DevOtp)
                    ? $"ส่ง OTP ใหม่ไปที่ {_maskedEmail}"
                    : $"รหัสใหม่คือ {result.DevOtp}",
                false);
        }
        catch (Exception ex)
        {
            SetStatus(ex.Message, true);
        }
        finally
        {
            _busy = false;
            SetBusy(false);
        }
    }

    private async Task LogoutAsync()
    {
        if (_busy) return;
        _busy = true;
        SetBusy(true);
        try
        {
            await _api.LogoutSessionAsync(CancellationToken.None);
            _session.Clear();
            ShowPanel(_credentialsPanel);
            AcceptButton = _loginButton;
            _tray.Text = "KINOF";
            SetStatus("ออกจากระบบแล้ว ที่นั่งว่าง", false);
        }
        catch (Exception ex)
        {
            SetStatus(ex.Message, true);
        }
        finally
        {
            _busy = false;
            SetBusy(false);
        }
    }

    private void RestoreWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        ShowInTaskbar = true;
        Activate();
    }

    private void HideToTray()
    {
        Hide();
        ShowInTaskbar = false;
        _tray.ShowBalloonTip(
            2000,
            "KINOF ยังทำงานอยู่",
            _session.User is null
                ? "เปิดจากไอคอนถาดระบบเมื่อต้องการล็อกอิน"
                : "ยังล็อกอินอยู่ เปิดจากไอคอนถาดเมื่อจะออกจากระบบ",
            ToolTipIcon.Info);
    }

    private async Task ExitFromTrayAsync()
    {
        if (_session.User is not null)
        {
            var answer = MessageBox.Show(
                this,
                "ยังมีผู้ใช้ล็อกอินบนเครื่องนี้อยู่ ต้องการออกจากระบบแล้วปิดโปรแกรมหรือไม่?",
                "ปิด KINOF",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (answer != DialogResult.Yes)
                return;
            await LogoutAsync();
        }

        _allowExit = true;
        Close();
    }

    private void OnResize(object? sender, EventArgs e)
    {
        if (WindowState == FormWindowState.Minimized)
            HideToTray();
    }

    private void OnClosing(object? sender, FormClosingEventArgs e)
    {
        if (_allowExit || e.CloseReason != CloseReason.UserClosing)
            return;

        e.Cancel = true;
        HideToTray();
    }

    private void OnSessionChanged()
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            BeginInvoke(RefreshView);
            return;
        }

        RefreshView();
    }

    private void RefreshView()
    {
        _seatLabel.Text = _session.SeatNumber > 0
            ? $"คอม {_session.SeatNumber:00}"
            : "กำลังเชื่อมต่อ…";

        if (_session.User is { } user)
        {
            _pendingUserId = 0;
            _signedInName.Text = string.IsNullOrWhiteSpace(user.DisplayName)
                ? user.Username
                : user.DisplayName;
            ShowPanel(_signedInPanel);
            AcceptButton = _logoutButton;
            _tray.Text = $"KINOF — {user.DisplayName ?? user.Username}";
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(_session.Notice))
                _pendingUserId = 0;

            if (_pendingUserId != 0)
            {
                ShowPanel(_otpPanel);
                AcceptButton = _verifyButton;
            }
            else
            {
                ShowPanel(_credentialsPanel);
                AcceptButton = _loginButton;
            }

            _tray.Text = "KINOF";
        }

        if (!string.IsNullOrWhiteSpace(_session.Notice))
            SetStatus(_session.Notice, true);
    }

    private void ShowPanel(Panel visible)
    {
        _credentialsPanel.Visible = visible == _credentialsPanel;
        _otpPanel.Visible = visible == _otpPanel;
        _signedInPanel.Visible = visible == _signedInPanel;
    }

    private void SetBusy(bool busy)
    {
        _loginButton.Enabled = !busy;
        _verifyButton.Enabled = !busy;
        _resendButton.Enabled = !busy;
        _logoutButton.Enabled = !busy;
        _username.Enabled = !busy;
        _password.Enabled = !busy;
        _otp.Enabled = !busy;
        UseWaitCursor = busy;
    }

    private void SetStatus(string text, bool error)
    {
        _statusLabel.Text = text;
        _statusLabel.ForeColor = error ? Danger : Ok;
        if (!error && (text.Contains("ถาด", StringComparison.Ordinal) || text.Contains("อีเมล", StringComparison.Ordinal)))
            _statusLabel.ForeColor = Muted;
    }

    private static Label Title(string text) => new()
    {
        Text = text,
        Location = new Point(0, 0),
        Size = new Size(304, 28),
        Font = new Font("Segoe UI Semibold", 13f),
        ForeColor = Ink
    };

    private static FieldPair Field(string placeholder, int top)
    {
        var wrap = new Panel
        {
            Location = new Point(0, top),
            Size = new Size(304, 42),
            BackColor = Color.White
        };
        wrap.Paint += (_, e) =>
        {
            using var pen = new Pen(Line, 1);
            e.Graphics.DrawLine(pen, 0, wrap.Height - 1, wrap.Width, wrap.Height - 1);
        };
        wrap.GotFocus += (_, _) => wrap.Invalidate();

        var box = new TextBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            PlaceholderText = placeholder,
            BackColor = Color.White,
            Font = new Font("Segoe UI", 11f)
        };
        box.Enter += (_, _) =>
        {
            wrap.Paint -= GoldLine;
            wrap.Paint += GoldLine;
            wrap.Invalidate();
        };
        box.Leave += (_, _) =>
        {
            wrap.Paint -= GoldLine;
            wrap.Invalidate();
        };

        wrap.Padding = new Padding(0, 10, 0, 8);
        wrap.Controls.Add(box);
        return new FieldPair(wrap, box);

        void GoldLine(object? _, PaintEventArgs e)
        {
            using var pen = new Pen(Gold, 2);
            e.Graphics.DrawLine(pen, 0, wrap.Height - 2, wrap.Width, wrap.Height - 2);
        }
    }

    private static Button PrimaryButton(string text, int top)
    {
        var button = new Button
        {
            Text = text,
            Location = new Point(0, top),
            Size = new Size(304, 40),
            BackColor = Navy,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
            Font = new Font("Segoe UI Semibold", 10.5f)
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = NavyMid;
        return button;
    }

    private static Button GhostButton(string text, int top, int left)
    {
        var button = new Button
        {
            Text = text,
            Location = new Point(left, top),
            Size = new Size(148, 32),
            BackColor = Color.White,
            ForeColor = Muted,
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
            Font = new Font("Segoe UI", 9f)
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = Page;
        return button;
    }

    private static Button DangerButton(string text, int top)
    {
        var button = PrimaryButton(text, top);
        button.BackColor = Color.FromArgb(153, 27, 27);
        button.FlatAppearance.MouseOverBackColor = Danger;
        return button;
    }

    private readonly record struct FieldPair(Panel Wrap, TextBox Box);
}
