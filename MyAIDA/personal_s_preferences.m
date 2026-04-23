function prefs = personal_s_preferences()
% DEF_S_PREFERENCES - default preferences for starcal
%   
% "Private" function, not much use for a user to call this
% manually. The function is called from the GUI.
% Calling:
%  SkMp = def_s_preferences(SkMp)

%   Copyright ©  2002 by Bjorn Gustavsson <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

screen_sz0 = [1920 1080];
screen_sz  = get(0,'ScreenSize');
screen_sz  = screen_sz(3:4);
q_sc_sz = mean(screen_sz./screen_sz0);

prefs.sz_z_r     = 12;                       % Side length of zoom region [dl] (pixels)
prefs.pl_sz_st   = max(1,round(18*q_sc_sz)); % Plot-size of stars
prefs.pl_cl_st   = [1 1 .6];                 % Plot colour of stars
prefs.pl_cl_slst = 'g';	                     % Plot colour of selected star
prefs.pl_cl_slwn = 'c';	                     % Plot colour of selection window
prefs.sz_st_pt   = max(1,round(15*q_sc_sz)); % Size of star-point-mark
prefs.cl_st_pt   = [1 0 0.2];                % Colour of star-point-mark
prefs.sz_er_pt   = 10;                       % Size of error-point-mark
prefs.cl_er_pt   = [1 0 0.4];                % Colour of error-point-mark
prefs.sc_er_ar   = 20;                       % Length scaling of error arrows
prefs.cl_er_ar   = 'r';                      % Colour of error arrows
prefs.pscoptlck  = 1e6;                      % Penalty scaling of optpar pseudolocking
prefs.mx_nr_st   = 150;                      % Max number of stars for autocal
prefs.sz_rg_st   = [.4 7];                   % Size range for stars (pixels) [autocal] 
prefs.hu_nm_ln   = 16;                       % Huber-tanh-norm length [autocal]
prefs.pl_cl_bg   = [0.8 0.8 1];              % Background colour of sky window
prefs.cmp_sky    = bone;
prefs.cmp_zoom   = turbo;
