function [ok] = skyhelp(val)
% SKYHELP - Main GUI help function
% 
% "Private" function called from the skymap/starcal GUI
% 
% Calling:
% [ok] = skyhelp(val)


%   Copyright © 20200918 Bjorn Gustavsson, <bjorn.gustavsson@uit.no>
%   This is free software, licensed under GNU GPL version 2 or later
%
%   Copyright © 1999 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

ok = 1;
if ( val == 5 )
  
  starhlp{1} = 'FILE';
  starhlp{2} = ['CLOSE - Close and quit the skymap session also' ...
		['clears the related variables from the matlab' ...
		 ' workspace']]; 
  starhlp{3} = ['PAGE SETUP - opens the page setup dialog window..' ...
		[' Allows the user to change the default set up for' ...
		 ' printing ']];
  starhlp{4} = 'PRINT - opens the Matlab printdlg. Allows the user to print';
  starhlp{5} = ' directly or to file. Due to the use of UICONTROLS the';
  starhlp{6} =  ' option -noui is recomended.                         ';
  starhlp{7} =   '                                                                                 ';
  starhlp{8} =   'POS/TIME                                                                         ';
  starhlp{9} =   ['DISPLAY POS/TIME - Prints the current position' ...
		  ' (long,lat) and date to the malab terminal window.'];
  starhlp{10} =   ['NEW POS/TIME makes a dialog window for changing' ...
		   ' the time and position'];
  starhlp{11} =   '                                                                                 ';
  starhlp{12} =   'STAR                                                                             ';
  starhlp{13} =   'INFORMATION gives information about the star closest to where You point and click';
  starhlp{14} =   '                                                                                 ';
  starhlp{15} =   'Plot-spectra - plots the spectra of a star if it is in the Pulkovo catalog       ';
  starhlp{16} =   '                                                                                 ';
  starhlp{17} =   'Assign-spectra - store the spectra of a Pulkovo star to variable                 ';
  starhlp{18} =   '                                                                                 ';
  starhlp{19} =   '(RA/DECL change the grid to rect ascention/declination.                          ';
  starhlp{20} =   '                                                                                 ';
  starhlp{21} =   'AZIM/ZEN change the grid to local azimuth/zenith.                                ';
  starhlp{22} =   '                                                                                 ';
  starhlp{23} =   'The popup menu in the window allows you to set maximum magnitude of the stars to ';
  starhlp{24} =   'be displayed.                                                                    ';
  starhlp{25} =   '                                                                                 ';
  starhlp{26} =   'The lower horizontal scrollbar is the EAST-WEST angle of the central point of    ';
  starhlp{27} =   'the feild of view, vertical is in the centre of the scrollbar.                   ';
  starhlp{28} =   '                                                                                 ';
  starhlp{29} =   'The upper horizontal scrollbar is the field of view.                             ';
  starhlp{30} =   '                                                                                 ';
  starhlp{31} =   'The left vertical scrollbar is the NORTH-SOUTH angle of the central point of the ';
  starhlp{32} =   'field of view, zenith is in the middle is all the way upp                        ';
  starhlp{33} =   '                                                                                 ';
  starhlp{34} =   'The right vertical scrollbar is the rotation angle of the                        ';
  starhlp{35} =   'feild of view.                                                                   ';
  
  elseif ( val == 6 )
    starhlp =['                            NO WARRANTY                                   ';
	'BECAUSE THE PROGRAM IS LICENSED FREE OF CHARGE, THERE IS NO WARRANTY      ';
	'FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW.  EXCEPT WHEN  ';
	'OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES    ';
	'PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED';
	'OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF      ';
	'MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.  THE ENTIRE RISK AS ';
	'TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU.  SHOULD THE    ';
	'PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING,  ';
	'REPAIR OR CORRECTION.                                                     ';
	'                                                                          ';
	'IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING     ';
	'WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MAY MODIFY AND/OR       ';
	'REDISTRIBUTE THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES,';
	'INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISIN';
	'OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED ';
	'TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY  ';
	'YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER';
	'PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE     ';
	'POSSIBILITY OF SUCH DAMAGES.                                              '];
    
  elseif ( val == 7 )
    
    starhlp =['Skymap - a user friendly medium accurace starchart program.         ';
	'Copyright (C) 2001-2020  Bjorn Gustavsson                           ';
	'                                                                    ';
	'This program is free software; you can redistribute it and/or modify';
	'it under the terms of the GNU General Public License as published by';
	'the Free Software Foundation; either version 2 of the License, or   ';
	'(at your option) any later version.                                 ';
	'                                                                    ';
	'This program is distributed in the hope that it will be useful,     ';
	'but WITHOUT ANY WARRANTY; without even the implied warranty of      ';
	'MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the       ';
	'GNU General Public License for more details.                        ';
	'                                                                    ';
	'You should have received a copy of the GNU General Public License   ';
	'along with this program; if not, write to the Free Software         ';
	'Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.           '];
    
    
end

if exist('starhlp','var')
  
  if ( exist('helpdlg','file') )
    
    helpdlg(starhlp,'starhelp 1')
    
  else
    
    disp(starhlp)
    
  end

end
